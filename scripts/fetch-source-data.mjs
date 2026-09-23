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

import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { WORKFLOWS } from "./lib/workflows.mjs";
import {
  api,
  downloadAsset,
  downloadFile,
  hasToken,
  latestRelease,
  listReleases,
  listRunJobs,
  listWorkflowRuns,
  parseJsonl,
  readJson,
  writeJson,
} from "./lib/github.mjs";

const OUT = path.join(process.cwd(), "source-data");
const HEALTH_DAYS = Number(process.env.HEALTH_DAYS || 14);
const LLM_MONTHS = Number(process.env.LLM_MONTHS || 6);
const RUN_WINDOW_DAYS = Number(process.env.RUN_WINDOW_DAYS || 30);
const SKIP_EXISTING = process.env.SKIP_EXISTING === "true";

const unzip = promisify(execFile).bind(null, "unzip");

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

// data-transformed: every venue's listings as the transform left them. It is
// the one place a matched listing still carries the title the venue gave it
// next to the TMDB title it matched - combine keeps the venue's title only when
// it differs from the one it picks to display, so the normaliser report cannot
// be built from combined-data. One asset per venue, around 20MB in all.
async function fetchTransformed() {
  await step("transformed data", path.join(OUT, "transformed-release.json"), async () => {
    const release = await latestRelease("clusterflick/data-transformed");
    const dir = path.join(OUT, "transformed");
    // Cleared first so a venue dropped from the pipeline doesn't linger here
    // from an older release.
    await rm(dir, { recursive: true, force: true });
    await mapWithConcurrency(release.assets, 8, (asset) =>
      downloadAsset(asset, path.join(dir, asset.name)),
    );
    await writeJson(path.join(OUT, "transformed-release.json"), {
      tag: release.tag_name,
      publishedAt: release.published_at,
      venues: release.assets.length,
    });
    return `${release.tag_name} (${release.assets.length} venues)`;
  });
}

// The title normaliser the matcher runs, taken from clusterflick/scripts at the
// head of main so the report judges titles exactly as the next match run will.
// Its local requires are followed, so a new helper file doesn't break the build;
// npm packages resolve from this project's node_modules, which is why
// `diacritics` is a dependency here.
async function fetchNormaliser() {
  await step("title normaliser", path.join(OUT, "normaliser", "source.json"), async () => {
    const commit = await api(
      "https://api.github.com/repos/clusterflick/scripts/commits/main",
      "clusterflick/scripts head",
    );
    const dir = path.join(OUT, "normaliser");
    await rm(dir, { recursive: true, force: true });
    const queue = ["normalize-title.js"];
    const seen = new Set();
    while (queue.length) {
      const file = queue.shift();
      if (seen.has(file)) continue;
      seen.add(file);
      const destination = path.join(dir, file);
      await downloadFile(
        `https://raw.githubusercontent.com/clusterflick/scripts/${commit.sha}/common/${file}`,
        destination,
        `common/${file}`,
      );
      const source = await readFile(destination, "utf8");
      for (const [, local] of source.matchAll(/require\("\.\/([^"]+)"\)/g)) {
        queue.push(local.endsWith(".js") ? local : `${local}.js`);
      }
    }
    await writeJson(path.join(dir, "source.json"), {
      sha: commit.sha,
      committedAt: commit.commit.committer.date,
      files: [...seen],
    });
    return `${commit.sha.slice(0, 7)} (${seen.size} files)`;
  });
}

// What each venue asked of the LLM on the latest transform run. The monthly log
// drops the per-venue breakdown, so this comes from the run's own artifacts:
// the usage report (cost per venue) and the raw per-call records it was built
// from (which call sites each venue hit). Artifacts expire after a fortnight
// and can only be downloaded with a token, so without one this records that it
// is unavailable rather than failing the build.
async function fetchLlmVenueUsage() {
  const file = path.join(OUT, "llm-venues.json");
  await step("llm usage by venue", file, async () => {
    if (!hasToken) {
      await writeJson(file, { available: false, reason: "no-token" });
      return "skipped — artifact downloads need a token";
    }
    const repo = "clusterflick/data-transformed";
    const { artifacts: reports } = await api(
      `https://api.github.com/repos/${repo}/actions/artifacts?name=llm-usage-report&per_page=10`,
      `${repo} usage reports`,
    );
    const report = reports.find((artifact) => !artifact.expired);
    if (!report) {
      await writeJson(file, { available: false, reason: "expired" });
      return "no unexpired usage report";
    }

    const runId = report.workflow_run.id;
    const { artifacts } = await api(
      `https://api.github.com/repos/${repo}/actions/runs/${runId}/artifacts?per_page=100`,
      `${repo} run ${runId} artifacts`,
    );
    const dir = path.join(OUT, "llm-venues");
    await rm(dir, { recursive: true, force: true });
    const wanted = [
      { artifact: report, into: path.join(dir, "report") },
      ...artifacts
        .filter((artifact) => artifact.name.startsWith("llm_usage_") && !artifact.expired)
        .map((artifact) => ({ artifact, into: path.join(dir, "venues") })),
    ];
    await mapWithConcurrency(wanted, 6, async ({ artifact, into }) => {
      const zip = path.join(dir, `${artifact.name}.zip`);
      await downloadFile(artifact.archive_download_url, zip, artifact.name, {
        accept: "application/vnd.github+json",
      });
      await unzip(["-o", "-q", zip, "-d", into]);
      await rm(zip);
    });

    const summary = await readJson(path.join(dir, "report", "llm-usage-report.json"));
    const venues = {};
    for (const venue of (await readdir(path.join(dir, "venues"))).sort()) {
      venues[venue] = await readJson(path.join(dir, "venues", venue));
    }
    await writeJson(file, {
      available: true,
      runId,
      runAt: report.created_at,
      venueCount: summary.metadata.venueCount,
      byVenue: summary.byVenue,
      records: venues,
    });
    return `run ${runId} (${Object.keys(summary.byVenue).length} venues used the LLM)`;
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

// A finished run's jobs never change, so their timings are kept between builds
// in .cache (restored by actions/cache in CI) and only new runs are looked up.
// Without it every build makes a jobs call per run - around 600 - which is fine
// nightly and a real share of the token's hourly limit when the site rebuilds
// after every health cycle.
const TIMINGS_CACHE = path.join(process.cwd(), ".cache", "run-timings.json");

async function readTimingsCache() {
  try {
    return JSON.parse(await readFile(TIMINGS_CACHE, "utf8"));
  } catch {
    return {};
  }
}

async function fetchWorkflowRuns() {
  const timingsCache = await readTimingsCache();
  // Everything in this window, cached or new. Written back as the whole cache,
  // so runs that have aged out of the window drop out of it too.
  const seen = {};
  const fetched = {};
  let lookups = 0;
  const since = Date.now() - RUN_WINDOW_DAYS * 86400000;
  // Sent to GitHub as the `created` filter rather than applied only here - see
  // `listWorkflowRuns`. Seconds precision: the API rejects the fractional form.
  const sinceIso = new Date(since).toISOString().replace(/\.\d+Z$/, "Z");
  const collected = {};
  const empty = [];

  for (const target of WORKFLOWS) {
    await step(`${target.name} runs`, path.join(OUT, "runs", `${target.key}.json`), async () => {
      const runs = await listWorkflowRuns(target.repo, target.workflow, {
        since: sinceIso,
      });
      // The window is already applied server-side; re-checking it here means a
      // filter that was ignored, or honoured against a stale index, cannot
      // quietly widen what gets reported. The same call
      // data-analysed/scripts/workflow-run-stats.js makes, for the same reason.
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
        const key = `${run.id}-${run.attempt}`;
        let timings = timingsCache[key];
        if (!timings) {
          const jobs = await listRunJobs(target.repo, run.id);
          timings = timingsFor(run, jobs);
          if (target.guardJob && run.conclusion === "success") {
            timings.didNothing = didNothing(jobs, target.guardJob);
          }
          // Only a finished attempt's jobs are final.
          if (run.conclusion) fetched[key] = timings;
          lookups += 1;
        }
        seen[key] = timings;
        Object.assign(run, timings);
        if (run.didNothing) skipped += 1;
      });

      await writeJson(path.join(OUT, "runs", `${target.key}.json`), inWindow);
      collected[target.key] = inWindow.length;

      // Every flow here runs at least daily, so an empty window is the run
      // history failing to come back rather than a flow that stopped. It is
      // carried through to the report as "no data" instead of as a zero,
      // because a zero renders as 0% succeeded - a flow that reported nothing
      // reading as a flow that failed everything.
      if (!inWindow.length) empty.push(target.name);

      return `${inWindow.length} in ${RUN_WINDOW_DAYS}d${skipped ? ` (${skipped} did nothing)` : ""}${
        inWindow.length ? "" : " — nothing came back, reporting as no data"
      }`;
    });
  }

  if (empty.length) {
    console.warn(
      `  ! no run history came back for ${empty.join(", ")} — reported as missing, not as zero`,
    );
  }

  if (Object.keys(seen).length) {
    await writeJson(
      TIMINGS_CACHE,
      Object.fromEntries(
        Object.entries(seen).filter(([key]) => timingsCache[key] || fetched[key]),
      ),
    );
    console.log(`  ${lookups} job lookups, ${Object.keys(seen).length - lookups} from cache`);
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
  await fetchTransformed();
  await fetchNormaliser();
  await fetchLlmUsage();
  await fetchLlmVenueUsage();
  await fetchVenueHealth();
  await fetchWorkflowRuns();
  await writeFile(
    path.join(OUT, "fetched-at.json"),
    JSON.stringify({ fetchedAt: new Date().toISOString() }),
  );
  console.log("Source data ready.");
}

await main();
