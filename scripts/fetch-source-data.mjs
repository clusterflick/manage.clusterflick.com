// Pulls everything the site reports on into ./source-data.
//
// Nothing here interprets the data - that is build-report.mjs's job. Keeping
// the download separate means a report can be rebuilt against an unchanged
// snapshot without spending the API budget again, which is most of what you do
// while working on the reports themselves.
//
// Usage: node scripts/fetch-source-data.mjs
//
// Env:
//   PAT / GH_TOKEN / GITHUB_TOKEN - raises the API rate limit. Every repo read
//                                   here is public, so this runs without one;
//                                   it just runs out of budget sooner.
//   HEALTH_DAYS  - how many daily venue-health releases to pull (default 14)
//   LLM_MONTHS   - how many monthly LLM usage releases to pull (default 6)
//   RUN_WINDOW_DAYS - how far back to read workflow runs (default 30)
//   SKIP_EXISTING - reuse anything already in ./source-data

import { readFile, stat, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { WORKFLOWS } from "./lib/workflows.mjs";
import {
  downloadAsset,
  hasToken,
  latestRelease,
  listReleases,
  listRunJobs,
  listWorkflowRuns,
  parseJsonl,
  writeJson,
} from "./lib/github.mjs";

const OUT = path.join(process.cwd(), "source-data");
const HEALTH_DAYS = Number(process.env.HEALTH_DAYS || 14);
const LLM_MONTHS = Number(process.env.LLM_MONTHS || 6);
const RUN_WINDOW_DAYS = Number(process.env.RUN_WINDOW_DAYS || 30);
const SKIP_EXISTING = process.env.SKIP_EXISTING === "true";


async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

async function step(label, file, work) {
  if (SKIP_EXISTING && (await exists(file))) {
    console.log(`· ${label} — reusing ${path.relative(process.cwd(), file)}`);
    return;
  }
  process.stdout.write(`· ${label} … `);
  const result = await work();
  console.log(result ?? "done");
}

// data-combined and data-matched: the current state of the catalogue.
async function fetchPipelineOutput() {
  await step("combined data", path.join(OUT, "combined-data.json"), async () => {
    const release = await latestRelease("clusterflick/data-combined");
    const asset = release.assets.find((a) => a.name === "combined-data.json");
    if (!asset) throw new Error("data-combined has no combined-data.json asset");
    await downloadAsset(asset, path.join(OUT, "combined-data.json"));
    await writeJson(path.join(OUT, "combined-release.json"), {
      tag: release.tag_name,
      publishedAt: release.published_at,
      sizeBytes: asset.size,
    });
    return `${release.tag_name} (${(asset.size / 1048576).toFixed(1)}MB)`;
  });

  await step("matched data", path.join(OUT, "matched", "imdb.json"), async () => {
    const release = await latestRelease("clusterflick/data-matched");
    // moviedb.json is the poster/metadata source; the rest are the rating
    // providers. All of them are small enough to take whole.
    for (const asset of release.assets) {
      await downloadAsset(asset, path.join(OUT, "matched", asset.name));
    }
    await writeJson(path.join(OUT, "matched-release.json"), {
      tag: release.tag_name,
      publishedAt: release.published_at,
      assets: release.assets.map(({ name, size }) => ({ name, size })),
    });
    return `${release.tag_name} (${release.assets.length} providers)`;
  });
}

// The LLM usage log lives one release per month, tagged llm-usage-YYYYMM, with
// one JSONL row per transform run. Months are stitched into a single series;
// rows carry their own date so nothing depends on which release they came from.
async function fetchLlmUsage() {
  await step("llm usage log", path.join(OUT, "llm-usage.json"), async () => {
    const releases = await listReleases("clusterflick/data-analysed");
    const months = releases
      .filter((release) => /^llm-usage-\d{6}$/.test(release.tag_name))
      .sort((a, b) => a.tag_name.localeCompare(b.tag_name))
      .slice(-LLM_MONTHS);

    const rows = [];
    for (const release of months) {
      const asset = release.assets.find((a) => a.name === "llm-usage-log.jsonl");
      if (!asset) continue;
      const file = path.join(OUT, "llm", `${release.tag_name}.jsonl`);
      await downloadAsset(asset, file);
      rows.push(...parseJsonl(await readFile(file, "utf8"), release.tag_name));
    }

    // Keyed by run, so a backfilled row replacing an earlier collection of the
    // same run cannot show up twice in the stitched series.
    const byRun = new Map(rows.map((row) => [row.runId, row]));
    const ordered = [...byRun.values()].sort(
      (a, b) => (a.at ?? a.date).localeCompare(b.at ?? b.date) || a.runId - b.runId,
    );
    await writeJson(path.join(OUT, "llm-usage.json"), ordered);
    return `${ordered.length} runs across ${months.length} months`;
  });
}

// Venue health is one release per London day, each holding that day's cycles.
// The releases are tagged YYYYMMDD alongside other daily tags, so the asset
// name is what identifies them rather than the tag shape.
async function fetchVenueHealth() {
  await step("venue health log", path.join(OUT, "health.json"), async () => {
    const releases = await listReleases("clusterflick/data-analysed");
    const days = releases
      .filter((release) => /^\d{8}$/.test(release.tag_name))
      .sort((a, b) => a.tag_name.localeCompare(b.tag_name))
      .slice(-HEALTH_DAYS);

    const rows = [];
    for (const release of days) {
      const asset = release.assets.find((a) => a.name === "health-log.jsonl");
      if (!asset) continue;
      const file = path.join(OUT, "health", `${release.tag_name}.jsonl`);
      await downloadAsset(asset, file);
      const day = release.tag_name;
      // `at` is UTC while the release tag is London, so through BST a day's
      // first cycle carries the previous date. The release it came from is the
      // grouping key - same call as analyse-health-log.js makes.
      for (const row of parseJsonl(await readFile(file, "utf8"), day)) {
        rows.push({ ...row, day });
      }
    }
    await writeJson(path.join(OUT, "health.json"), rows);
    return `${rows.length} probes across ${days.length} days`;
  });
}

// Every run's jobs are fetched, because `updated_at - run_started_at` is not a
// build time.
//
// GitHub sets `run_started_at` when the run is created and `updated_at` when
// the run record last changed, so the gap between them includes however long
// the run sat waiting for a runner. One data-diffed run queued for 53 minutes
// and then executed in 2m20s; the subtraction called it a 55-minute build, and
// GitHub's own `run_duration_ms` agrees, because it is measuring the same span.
// That is a real number, but it describes runner availability, not the build -
// and averaged into "how long does diff take" it says something false.
//
// So: queue is `run_started_at` -> the first job actually starting, and
// execution is the first job starting -> the last job finishing. They answer
// different questions and the site reports them apart.
//
// Skipped jobs are ignored throughout. They carry timestamps but never ran, and
// a trailing skipped job would otherwise extend execution past the real end.
function timingsFor(run, jobs) {
  const ran = jobs.filter(
    (job) => job.conclusion !== "skipped" && job.started_at && job.completed_at,
  );
  if (!ran.length) return { queuedMs: null, executionMs: null };

  const startedAt = Math.min(...ran.map((job) => new Date(job.started_at).getTime()));
  const completedAt = Math.max(
    ...ran.map((job) => new Date(job.completed_at).getTime()),
  );
  const dispatchedAt = new Date(run.startedAt).getTime();

  return {
    // Clamped at zero: a job can report starting a second before the run
    // record's own timestamp, and a negative wait is not a thing.
    queuedMs: Math.max(startedAt - dispatchedAt, 0),
    executionMs: Math.max(completedAt - startedAt, 0),
  };
}

// A run whose guard job succeeded and whose every other job was skipped did no
// work.
function didNothing(jobs, guardJob) {
  const guard = jobs.find((job) => job.name === guardJob);
  if (!guard || guard.conclusion !== "success") return false;
  const rest = jobs.filter((job) => job.name !== guardJob);
  return rest.length > 0 && rest.every((job) => job.conclusion === "skipped");
}

// One jobs call per run, a few hundred across the window. Run with a small
// amount of concurrency so the collection takes seconds rather than minutes,
// but well under any secondary rate limit.
async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

async function fetchWorkflowRuns() {
  const since = Date.now() - RUN_WINDOW_DAYS * 86400000;
  const collected = {};

  for (const target of WORKFLOWS) {
    await step(`${target.name} runs`, path.join(OUT, "runs", `${target.key}.json`), async () => {
      const runs = await listWorkflowRuns(target.repo, target.workflow);
      const inWindow = runs
        .filter((run) => new Date(run.run_started_at ?? run.created_at).getTime() >= since)
        .map((run) => ({
          id: run.id,
          attempt: run.run_attempt,
          conclusion: run.conclusion,
          event: run.event,
          startedAt: run.run_started_at ?? run.created_at,
          updatedAt: run.updated_at,
          url: run.html_url,
          displayTitle: run.display_title,
        }));

      let skipped = 0;
      await mapWithConcurrency(inWindow, 6, async (run) => {
        const jobs = await listRunJobs(target.repo, run.id);
        Object.assign(run, timingsFor(run, jobs));
        if (target.guardJob && run.conclusion === "success") {
          run.didNothing = didNothing(jobs, target.guardJob);
          if (run.didNothing) skipped += 1;
        }
      });

      await writeJson(path.join(OUT, "runs", `${target.key}.json`), inWindow);
      collected[target.key] = inWindow.length;
      return `${inWindow.length} in ${RUN_WINDOW_DAYS}d${skipped ? ` (${skipped} did nothing)` : ""}`;
    });
  }

  await writeJson(path.join(OUT, "runs", "meta.json"), {
    windowDays: RUN_WINDOW_DAYS,
    collectedAt: new Date().toISOString(),
    counts: collected,
  });
}

async function main() {
  await mkdir(OUT, { recursive: true });
  console.log(
    `Fetching source data into ./source-data${hasToken ? "" : " (no token — public rate limit)"}`,
  );
  await fetchPipelineOutput();
  await fetchLlmUsage();
  await fetchVenueHealth();
  await fetchWorkflowRuns();
  await writeFile(
    path.join(OUT, "fetched-at.json"),
    JSON.stringify({ fetchedAt: new Date().toISOString() }),
  );
  console.log("Source data ready.");
}

await main();
