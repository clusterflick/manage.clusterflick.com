// Turns ./source-data into the JSON the pages import at build time.
//
// One file per page rather than one big report: the catalogue report carries a
// few hundred unmatched titles, and a static export inlines whatever a page
// imports into that page's payload. Splitting keeps the pipeline page from
// shipping the movie lists and vice versa.
//
// Usage: node scripts/build-report.mjs   (after fetch-source-data.mjs)

import { readFile } from "node:fs/promises";
import path from "node:path";
import { readJson, writeJson } from "./lib/github.mjs";
import { round } from "./lib/stats.mjs";
import { WORKFLOWS } from "./lib/workflows.mjs";
import buildCatalogueReport from "./lib/report-catalogue.mjs";
import buildLlmReport from "./lib/report-llm.mjs";
import buildPipelineReport from "./lib/report-pipeline.mjs";
import buildHealthReport from "./lib/report-health.mjs";

const SOURCE = path.join(process.cwd(), "source-data");
const OUT = path.join(process.cwd(), "src", "generated");

const source = (...parts) => path.join(SOURCE, ...parts);

// The alert list is the whole point of the overview: four reports' worth of
// detail reduced to "what, if anything, needs you today". Each one names the
// page that explains it, so the overview never has to repeat the detail.
//
// Severities are the status palette's, and every alert ships a label - colour
// never carries the meaning on its own.
function buildAlerts({ catalogue, llm, pipeline, health }) {
  const alerts = [];

  const dataAgeHours =
    (Date.now() - new Date(catalogue.generatedAt).getTime()) / 3600000;
  if (dataAgeHours > 24) {
    alerts.push({
      severity: "critical",
      title: "Combined data is over a day old",
      detail: `The newest data-combined release was generated ${Math.round(dataAgeHours)} hours ago. The pipeline normally publishes several times a day.`,
      href: "/pipeline",
    });
  }

  // Only film listings count here - shorts programmes and Q&As have no film to
  // match to, and folding them in makes this fire permanently.
  const missRate = 1 - catalogue.matching.filmMatchRate;
  if (missRate > 0.1) {
    alerts.push({
      severity: missRate > 0.2 ? "critical" : "warning",
      title: `${catalogue.matching.unmatchedFilms} film listings are unmatched`,
      detail: `${round(missRate * 100, 1)}% of listings categorised as films have no match. Unmatched shorts, talks and events are excluded — those are expected.`,
      href: "/catalogue",
    });
  }

  const posters = catalogue.fieldCoverage.find((field) => field.key === "posterPath");
  if (posters && posters.total - posters.present > 0) {
    alerts.push({
      severity: "warning",
      title: `${posters.total - posters.present} matched movies have no poster`,
      detail:
        "These matched to a film but came back without artwork, so they render as blanks on the site.",
      href: "/catalogue#coverage",
    });
  }

  for (const workflow of pipeline.workflows) {
    // The case that used to be skipped in silence. A flow with no runs raised
    // no alert at all, so the overview stayed calm while the pipeline page
    // showed the same flow at 0% in red. It is the loudest thing on the page
    // that the numbers cannot be trusted, so it says so.
    if (!workflow.runs) {
      alerts.push({
        severity: "warning",
        title: `${workflow.name} reported no runs`,
        detail: `No run history came back for ${workflow.repo} over the last ${pipeline.windowDays} days. Every flow here runs at least daily, so these figures are missing rather than zero — GitHub's run list intermittently answers from a stale index. Rebuilding usually clears it.`,
        href: `/pipeline#${workflow.key}`,
      });
      continue;
    }
    if (workflow.reportsUnassisted && workflow.unassistedRate < 0.75) {
      alerts.push({
        severity: workflow.unassistedRate < 0.5 ? "critical" : "warning",
        title: `${workflow.name} needed a hand on ${workflow.assistedRuns} of ${workflow.runs} runs`,
        detail: `Only ${Math.round(workflow.unassistedRate * 100)}% of runs in the last ${pipeline.windowDays} days finished first time unaided.`,
        href: `/pipeline#${workflow.key}`,
      });
    } else if (workflow.successRate < 0.9) {
      alerts.push({
        severity: workflow.successRate < 0.75 ? "critical" : "warning",
        title: `${workflow.name} failed ${workflow.runs - workflow.succeeded} times`,
        detail: `${Math.round(workflow.successRate * 100)}% of its ${workflow.runs} completed runs succeeded over the last ${pipeline.windowDays} days.`,
        href: `/pipeline#${workflow.key}`,
      });
    }
  }

  if (!llm.empty) {
    if (llm.latest.day.unpriced) {
      alerts.push({
        severity: "warning",
        title: "Some LLM calls used a model with no listed price",
        detail:
          "The cost figures are an undercount by whatever those calls cost, so a dip in the series may be a pricing gap rather than a saving.",
        href: "/llm-usage",
      });
    }
    // A cache that has gone cold is the single biggest lever on spend - a cold
    // run costs several times what the same work costs warm.
    //
    //
    // Judged on the warm rate, which leaves out the day's first run: that one
    // is always cold, and counting it raised this every morning and left a
    // normal day sitting on the threshold. `null` before a second run, when
    // there is nothing to judge yet.
    const warm = llm.latest.day.warmCacheHitRate;
    if (warm !== null && warm < 0.5) {
      alerts.push({
        severity: warm < 0.25 ? "critical" : "warning",
        title: `LLM cache hit rate is ${Math.round(warm * 100)}%`,
        detail: `On ${llm.latest.day.date} the transform runs after the first of the day hit cache on only ${Math.round(warm * 100)}% of calls. The first run is always cold; a later one should not be, and a cold cache is what makes a day expensive.`,
        href: "/llm-usage",
      });
    }
  }

  if (!health.empty) {
    // A handful of failures across a fortnight of probes is background noise;
    // a source failing more than a fifth of the time has stopped working.
    for (const venue of health.venues.filter((entry) => entry.failureRate > 0.2)) {
      alerts.push({
        severity: venue.failureRate > 0.5 ? "critical" : "warning",
        title: `${venue.venue} failed ${venue.failures} of ${venue.probes} health probes`,
        detail: `${Math.round(venue.failureRate * 100)}% of probes over the last ${health.window.days} days came back with nothing.`,
        href: "/venues",
      });
    }
  }

  // Only cinemas. The 268 "host" venues - community centres, pubs, parks - are
  // empty almost all of the time by their nature, and counting them here would
  // fire a permanent alert about 130-odd venues that are behaving normally.
  const silentCinemas = catalogue.silentVenues.cinemas.length;
  if (silentCinemas > 0) {
    alerts.push({
      severity: silentCinemas > 5 ? "critical" : "warning",
      title: `${silentCinemas} ${silentCinemas === 1 ? "cinema has" : "cinemas have"} no listings at all`,
      detail:
        "A cinema is always showing something, so an empty one usually means its retrieval has stopped producing rather than that it went dark. Venues that only host the occasional screening are excluded.",
      href: "/catalogue#silent",
    });
  }

  const order = { critical: 0, serious: 1, warning: 2, good: 3 };
  return alerts.sort((a, b) => order[a.severity] - order[b.severity]);
}

function buildOverview({ catalogue, llm, pipeline, health }, fetchedAt) {
  return {
    fetchedAt,
    dataGeneratedAt: catalogue.generatedAt,
    release: catalogue.release,
    alerts: buildAlerts({ catalogue, llm, pipeline, health }),
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
          venuesWithFailures: health.totals.venuesWithFailures,
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

  const llm = buildLlmReport(await readJson(source("llm-usage.json")));
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
  console.log(`· overview — ${overview.alerts.length} alerts`);

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
