// Turns ./source-data into the JSON the pages import at build time.
//
// One file per page rather than one big report: the catalogue report carries a
// few hundred unmatched titles, and a static export inlines whatever a page
// imports into that page's payload. Splitting keeps the pipeline page from
// shipping the movie lists and vice versa.
//
// Usage: node scripts/build-report.mjs   (after fetch-source-data.mjs)

import { readdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { readJson, writeJson } from "./lib/github.mjs";
import { WORKFLOWS } from "./lib/workflows.mjs";
import buildCatalogueReport from "./lib/report-catalogue.mjs";
import buildLlmReport from "./lib/report-llm.mjs";
import buildPipelineReport from "./lib/report-pipeline.mjs";
import buildHealthReport from "./lib/report-health.mjs";
import buildNormaliserReport from "./lib/report-normaliser.mjs";
import buildFlappingReport from "./lib/report-flapping.mjs";

const SOURCE = path.join(process.cwd(), "source-data");
const OUT = path.join(process.cwd(), "src", "generated");

const source = (...parts) => path.join(SOURCE, ...parts);

function buildOverview({ catalogue, llm, pipeline, health }, fetchedAt) {
  return {
    fetchedAt,
    dataGeneratedAt: catalogue.generatedAt,
    release: catalogue.release,
    catalogue: {
      movies: catalogue.totals.movies,
      venues: catalogue.totals.venues,
      upcomingPerformances: catalogue.totals.upcomingPerformances,
      filmMatchRate: catalogue.matching.filmMatchRate,
      unmatchedFilms: catalogue.matching.unmatchedFilms,
      posterCoverage:
        catalogue.fieldCoverage.find((field) => field.key === "posterPath")?.coverage ?? null,
    },
    llm: llm.empty
      ? null
      : {
          latestDate: llm.latest.day.date,
          latestCost: llm.latest.day.estimatedCostUsd,
          latestCacheHitRate: llm.latest.day.warmCacheHitRate,
          meanCostPerDay: llm.costPerDay.mean,
          weekOnWeek: llm.costPerDay.weekOnWeek,
          projection: llm.projection,
          sparkline: llm.days.map((day) => day.estimatedCostUsd),
        },
    pipeline: {
      windowDays: pipeline.windowDays,
      workflows: pipeline.workflows.map((workflow) => ({
        key: workflow.key,
        name: workflow.name,
        runs: workflow.runs,
        successRate: workflow.successRate,
        reportsUnassisted: workflow.reportsUnassisted,
        unassistedRate: workflow.unassistedRate,
        unassistedGap: workflow.unassistedGap,
        medianDurationMs: workflow.duration.medianMs,
        lastRun: workflow.lastRun,
      })),
    },
    health: health.empty
      ? null
      : {
          days: health.window.days,
          venues: health.window.venues,
          probes: health.window.probes,
          failureRate: health.totals.failureRate,
          failingNow: health.totals.failingNow,
        },
  };
}

async function main() {
  console.log("Building reports from ./source-data");

  const combined = await readJson(source("combined-data.json"));
  const combinedRelease = await readJson(source("combined-release.json"));
  const matchedRelease = await readJson(source("matched-release.json"));
  const { fetchedAt } = await readJson(source("fetched-at.json"));

  const matched = {};
  for (const asset of matchedRelease.assets) {
    const key = asset.name.replace(/\.json$/, "");
    matched[key] = await readJson(source("matched", asset.name));
  }

  const catalogue = buildCatalogueReport(combined, matched, {
    combined: combinedRelease,
    matched: { tag: matchedRelease.tag, publishedAt: matchedRelease.publishedAt },
  });
  console.log(
    `· catalogue — ${catalogue.totals.movies} movies, ${catalogue.matching.unmatchedFilms} unmatched film listings`,
  );

  // The matcher's own normaliser, downloaded from the scripts repo. CommonJS,
  // so it is loaded through require rather than import.
  const normaliserSource = await readJson(source("normaliser", "source.json"));
  const normalizeTitle = createRequire(import.meta.url)(
    source("normaliser", "normalize-title.js"),
  );
  const transformed = {};
  for (const venue of (await readdir(source("transformed"))).sort()) {
    transformed[venue] = await readJson(source("transformed", venue));
  }
  catalogue.normaliser = buildNormaliserReport({
    transformed,
    normalizeTitle,
    combined,
    venues: combined.venues,
    source: {
      transformed: await readJson(source("transformed-release.json")),
      scripts: { sha: normaliserSource.sha, committedAt: normaliserSource.committedAt },
    },
  });
  console.log(
    `· normaliser — ${catalogue.normaliser.mismatched} of ${catalogue.normaliser.checked} matched listings normalise apart from their TMDB title`,
  );

  const releases = await readJson(source("combined-history", "index.json"));
  const history = [];
  for (const release of releases) {
    history.push({
      ...release,
      ...(await readJson(source("combined-history", `${release.tag}.json`))),
    });
  }
  catalogue.flapping = buildFlappingReport({
    history,
    venues: combined.venues,
    latestMovies: combined.movies,
  });
  console.log(
    `· flapping — over ${history.length} releases, ${catalogue.flapping.match.listings} listings flapped between matches and ${catalogue.flapping.presence.listings} in and out`,
  );

  const llm = buildLlmReport(
    await readJson(source("llm-usage.json")),
    await readJson(source("llm-venues.json")),
  );
  console.log(
    llm.empty
      ? "· llm usage — no rows"
      : `· llm usage — ${llm.window.runs} runs over ${llm.window.days} days, $${llm.totals.estimatedCostUsd.toFixed(2)}`,
  );

  const runsByKey = {};
  for (const target of WORKFLOWS) {
    runsByKey[target.key] = await readJson(source("runs", `${target.key}.json`));
  }
  const pipeline = buildPipelineReport(
    WORKFLOWS,
    runsByKey,
    await readJson(source("runs", "meta.json")),
  );
  console.log(
    `· pipeline — ${pipeline.workflows.length} workflows over ${pipeline.windowDays} days`,
  );

  const health = buildHealthReport(await readJson(source("health.json")));
  console.log(
    health.empty
      ? "· venue health — no rows"
      : `· venue health — ${health.window.probes} probes across ${health.window.venues} venues`,
  );

  const overview = buildOverview({ catalogue, llm, pipeline, health }, fetchedAt);

  for (const [name, value] of Object.entries({
    overview,
    catalogue,
    llm,
    pipeline,
    health,
  })) {
    const file = await writeJson(path.join(OUT, `${name}.json`), value);
    const { size } = await readFile(file).then((buffer) => ({ size: buffer.length }));
    console.log(`  wrote src/generated/${name}.json (${(size / 1024).toFixed(0)}KB)`);
  }
}

await main();
