// What the transform pipeline is spending on the LLM, and where it goes.
//
// The log holds one row per transform run, and the pipeline runs two to four
// times a day, so nearly every question here is a question about days rather
// than runs: a day's figures are the sum of its rows. Anything that reads a
// single row as a day understates spend by however many runs it dropped.
//
// Cost is the headline, but the cache hit rate is the number that explains it.
// A run with a cold cache costs several times what the same work costs warm -
// the series shows exactly that, with 15% cached at the start of a month and
// 90%+ once it settles.

import { groupBy, mean, percentile, rate, round, sum, trend } from "./stats.mjs";

// The report stores cost at six places so per-call-site figures still sum to
// the run total; four is what anything user-facing should print.
const money = (value) => round(value, 6);

function dayTotals(rows) {
  const calls = sum(rows.map((row) => row.calls));
  const cacheHits = sum(rows.map((row) => row.cacheHits));
  return {
    runs: rows.length,
    calls,
    cacheHits,
    cacheMisses: sum(rows.map((row) => row.cacheMisses)),
    cacheHitRate: round(rate(cacheHits, calls)),
    promptTokens: sum(rows.map((row) => row.promptTokens)),
    candidatesTokens: sum(rows.map((row) => row.candidatesTokens)),
    estimatedCostUsd: money(sum(rows.map((row) => row.estimatedCostUsd))),
    // Carried through so a dip in the series can be told apart from a pricing
    // gap: when a call used a model with no listed price, the cost above is an
    // undercount by whatever those calls cost.
    unpriced: rows.some((row) => row.modelsWithoutPricing),
  };
}

// How far back the day-level figures reach. The log goes back months, and a
// chart spanning all of it flattens the last few weeks - the part anyone is
// looking at - into the right-hand edge.
export const WINDOW_DAYS = 30;

// Which model provider serves each call site. The log records call sites, not
// providers, but the stages that moved to Jev were renamed as they went
// (ask-llm-to-categorise became ask-jev-to-categorise), so the prefix says
// where a call went. Everything else is still on Gemini.
const PROVIDERS = ["Jev", "Gemini"];
const providerOf = (callSite) => (callSite.startsWith("ask-jev-") ? "Jev" : "Gemini");

// One run's spend split by provider, with the call sites behind each share.
// Built from the same per-call-site buckets as the run total, so the providers
// sum to the row. A provider the run made no calls to is left out.
function runByProvider(row) {
  const sites = Object.entries(row.byCallSite ?? {})
    .map(([name, bucket]) => ({
      name,
      calls: bucket.calls,
      cacheMisses: bucket.cacheMisses,
      estimatedCostUsd: money(bucket.estimatedCostUsd),
    }))
    .filter((site) => site.calls > 0);
  const byProvider = groupBy(sites, (site) => providerOf(site.name));
  return PROVIDERS.filter((provider) => byProvider.has(provider)).map((provider) => {
    const group = byProvider.get(provider);
    const calls = sum(group.map((site) => site.calls));
    const cacheMisses = sum(group.map((site) => site.cacheMisses));
    return {
      provider,
      calls,
      cacheMisses,
      cacheHitRate: round(rate(calls - cacheMisses, calls)),
      estimatedCostUsd: money(sum(group.map((site) => site.estimatedCostUsd))),
      callSites: group.sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd),
    };
  });
}

const shiftDate = (date, days) => {
  const shifted = new Date(`${date}T12:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
};

// What each venue asked of the LLM on one transform run: cost from the run's
// usage report, and which call sites it hit from the per-call records behind
// it. Most expensive first, then busiest, so the venues worth trimming lead.
function buildVenueUsage(venueUsage) {
  if (!venueUsage?.available) {
    return { available: false, reason: venueUsage?.reason ?? "missing", venues: [] };
  }
  const venues = Object.entries(venueUsage.byVenue)
    .map(([venueId, bucket]) => {
      const records = venueUsage.records[venueId] ?? [];
      const callSites = [...groupBy(records, (record) => record.cacheKeyPrefix)]
        .map(([name, group]) => ({
          name,
          calls: group.length,
          cacheMisses: group.filter((record) => !record.cacheHit).length,
        }))
        .sort((a, b) => b.calls - a.calls);
      return {
        venueId,
        calls: bucket.calls,
        cacheMisses: bucket.cacheMisses,
        cacheHitRate: round(bucket.cacheHitRate),
        estimatedCostUsd: money(bucket.estimatedCostUsd),
        maxPromptChars: bucket.maxPromptChars,
        callSites,
      };
    })
    .sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd || b.calls - a.calls);
  return {
    available: true,
    runId: venueUsage.runId,
    runAt: venueUsage.runAt,
    venueCount: venueUsage.venueCount,
    venues,
  };
}

export default function buildLlmReport(allRows, venueUsage) {
  if (!allRows.length) {
    return { empty: true, runs: [], days: [], callSites: [], months: [] };
  }

  // Months and the projection are read over the whole log, since a month cut
  // off at the window's edge would compare as a short month. Everything else
  // is the last WINDOW_DAYS.
  const lastDate = allRows[allRows.length - 1].date;
  const firstDate = shiftDate(lastDate, -(WINDOW_DAYS - 1));
  const rows = allRows.filter((row) => row.date >= firstDate);

  // The cache expires overnight, so a day's first run is always cold - 11-17%
  // every day in the log - and folding it in drags a day of healthy ~90% runs
  // down to about 50%. That says nothing about whether the cache is working, so
  // the warm rate is taken over the runs after the first. `null` until a day
  // has a second run: there is nothing warm to judge yet. Rows arrive ordered
  // by `at`, and groupBy keeps that order.
  const warmHitRate = (dayRows) => {
    const warm = dayRows.slice(1);
    if (!warm.length) return null;
    return round(
      rate(sum(warm.map((row) => row.cacheHits)), sum(warm.map((row) => row.calls))),
    );
  };

  const byDay = [...groupBy(rows, (row) => row.date)]
    .map(([date, dayRows]) => ({
      date,
      ...dayTotals(dayRows),
      warmCacheHitRate: warmHitRate(dayRows),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const byMonth = [...groupBy(allRows, (row) => row.date.slice(0, 7))]
    .map(([month, monthRows]) => {
      const days = new Set(monthRows.map((row) => row.date));
      const totals = dayTotals(monthRows);
      return {
        month,
        days: days.size,
        ...totals,
        costPerDay: money(rate(totals.estimatedCostUsd, days.size)),
      };
    })
    .sort((a, b) => a.month.localeCompare(b.month));

  // Every call site seen anywhere in the window, not just in the latest run - a
  // stage that stopped being called should show as a gap in its series rather
  // than vanishing from the report.
  const callSiteNames = [
    ...new Set(rows.flatMap((row) => Object.keys(row.byCallSite ?? {}))),
  ].sort();

  const callSites = callSiteNames
    .map((name) => {
      const buckets = rows
        .map((row) => ({ row, bucket: row.byCallSite?.[name] }))
        .filter(({ bucket }) => bucket);
      const cost = sum(buckets.map(({ bucket }) => bucket.estimatedCostUsd));
      const calls = sum(buckets.map(({ bucket }) => bucket.calls));
      const misses = sum(buckets.map(({ bucket }) => bucket.cacheMisses));
      return {
        name,
        calls,
        cacheMisses: misses,
        missRate: round(rate(misses, calls)),
        estimatedCostUsd: money(cost),
        // Per thousand, not per call: a call costs a few hundredths of a
        // cent, and a per-call figure rounds to $0.0000 for every stage -
        // which compares nothing.
        costPerThousandCalls: money(rate(cost, calls) * 1000),
        // A per-day series so a stage that lost its cache is visible as the
        // moment its cost separated from the others.
        byDay: [...groupBy(buckets, ({ row }) => row.date)]
          .map(([date, entries]) => ({
            date,
            calls: sum(entries.map(({ bucket }) => bucket.calls)),
            cacheMisses: sum(entries.map(({ bucket }) => bucket.cacheMisses)),
            estimatedCostUsd: money(
              sum(entries.map(({ bucket }) => bucket.estimatedCostUsd)),
            ),
          }))
          .sort((a, b) => a.date.localeCompare(b.date)),
      };
    })
    .sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd);

  // Which venues produce the biggest prompts. Only the single largest prompt
  // per run is logged, so this is a tally of "worst offender" appearances
  // rather than a ranking of every venue - said plainly on the page.
  const largest = rows.filter((row) => row.largestPrompt);
  const largestPrompts = [...groupBy(largest, (row) => row.largestPrompt.venueId)]
    .map(([venueId, entries]) => ({
      venueId,
      appearances: entries.length,
      maxPromptChars: Math.max(...entries.map((row) => row.largestPrompt.promptChars)),
      callSites: [
        ...new Set(entries.map((row) => row.largestPrompt.cacheKeyPrefix)),
      ].sort(),
    }))
    .sort((a, b) => b.maxPromptChars - a.maxPromptChars)
    .slice(0, 25);

  const dailyCosts = byDay.map((day) => day.estimatedCostUsd);
  const latestDay = byDay[byDay.length - 1];
  const latestRun = rows[rows.length - 1];

  // A month's run rate projected over its full length. Only meaningful for the
  // month in progress, which is the last one in the series.
  const currentMonth = byMonth[byMonth.length - 1];
  const daysInMonth = new Date(
    Number(currentMonth.month.slice(0, 4)),
    Number(currentMonth.month.slice(5, 7)),
    0,
  ).getDate();

  return {
    empty: false,
    window: {
      windowDays: WINDOW_DAYS,
      firstDate: byDay[0].date,
      lastDate: latestDay.date,
      runs: rows.length,
      days: byDay.length,
    },
    totals: {
      estimatedCostUsd: money(sum(rows.map((row) => row.estimatedCostUsd))),
      calls: sum(rows.map((row) => row.calls)),
      promptTokens: sum(rows.map((row) => row.promptTokens)),
      candidatesTokens: sum(rows.map((row) => row.candidatesTokens)),
    },
    latest: {
      day: latestDay,
      runAt: latestRun.at ?? null,
      runId: latestRun.runId,
      venuesWithLlmUsage: latestRun.venuesWithLlmUsage,
      venueCount: latestRun.venueCount,
    },
    costPerDay: {
      mean: money(mean(dailyCosts)),
      median: money(percentile(dailyCosts, 0.5)),
      p90: money(percentile(dailyCosts, 0.9)),
      max: money(Math.max(...dailyCosts)),
      // Last week against the week before it. `null` until there are two
      // weeks to compare, which reads differently from "flat".
      weekOnWeek: trend(dailyCosts, 7),
    },
    projection: {
      month: currentMonth.month,
      daysSoFar: currentMonth.days,
      daysInMonth,
      spentSoFar: currentMonth.estimatedCostUsd,
      projected: money(currentMonth.costPerDay * daysInMonth),
    },
    days: byDay,
    months: byMonth,
    callSites: callSites.filter((site) => site.calls > 0),
    largestPrompts,
    venueUsage: buildVenueUsage(venueUsage),
    // Per-run series, for the runs-within-a-day view. Trimmed to the fields the
    // charts read: the full rows are large and nothing plots the rest.
    runs: rows.map((row) => ({
      runId: row.runId,
      date: row.date,
      at: row.at ?? null,
      calls: row.calls,
      cacheHitRate: round(row.cacheHitRate),
      estimatedCostUsd: money(row.estimatedCostUsd),
      promptTokens: row.promptTokens,
      venuesWithLlmUsage: row.venuesWithLlmUsage,
      venueCount: row.venueCount,
      byProvider: runByProvider(row),
    })),
  };
}
