// Venue health: whether each source is still answering, and with how much.
//
// The health workflow probes a subset of venues several times a day and writes
// one row per venue per cycle. A row with `counts: null` and a `reason` is a
// probe that came back with nothing, and `reason.kind` says whose fault it was
// - `probe-error` is ours or the network's, `source-maintenance` and
// `source-queue` are the venue telling us to come back later. Worth keeping
// apart: a fortnight of 503s is a site being rebuilt, not a scraper to fix.
//
// Two things this deliberately does not do, for the same reasons
// data-analysed/scripts/analyse-health-log.js gives:
//
//   - Sum counts across chains. A chain answering with individual performances
//     and one answering with a film x date matrix are counting different
//     things. `films` and `dates` are comparable everywhere; nothing finer is
//     totalled across granularities.
//
//   - Group by the date in `at`. That field is UTC while the release tag is
//     London, so through BST a day's first cycle carries the previous date.
//     The release a row came from is the grouping key, carried as `day`.

import { groupBy, mean, percentile, rate, round } from "./stats.mjs";

// What a chain's third count is called, keyed off the row's own `granularity`
// so a chain changing what it reports shows up rather than being miscounted.
// Omniplex has no third count - it reports the size of each axis, and `films`
// and `dates` are the whole of it.
const GRANULARITY_METRIC = {
  "film-date": "filmDatePairs",
  performance: "performances",
  "film-and-date-totals": null,
};

const failed = (row) => Boolean(row.reason) || !row.counts;

const failureKind = (row) => row.reason?.kind ?? "no-counts";

const failureMessage = (row) =>
  row.reason?.message ?? (row.reason?.status ? `status ${row.reason.status}` : null);

function currentOutage(ordered) {
  let start = ordered.length;
  while (start > 0 && failed(ordered[start - 1])) start -= 1;
  if (start === ordered.length) return null;
  const latest = ordered[ordered.length - 1];
  return {
    since: ordered[start].at,
    probes: ordered.length - start,
    // Null when the source has failed every probe in the window, so "since"
    // is only as far back as the window reaches.
    lastOkAt: start > 0 ? ordered[start - 1].at : null,
    kind: failureKind(latest),
    message: failureMessage(latest),
  };
}

// What a source's failures looked like, for the row that expands under it in
// the table: how many of each kind, and the distinct messages behind them. A
// probe timing out forty times reads as one message with a count, not forty
// rows.
function summariseFailures(failures) {
  const kinds = [...groupBy(failures, failureKind)]
    .map(([kind, group]) => ({ kind, count: group.length }))
    .sort((a, b) => b.count - a.count);
  const messages = [
    ...groupBy(failures, (row) => `${failureKind(row)}\u0000${failureMessage(row) ?? ""}`),
  ]
    .map(([, group]) => {
      const latest = group[group.length - 1];
      return {
        kind: failureKind(latest),
        message: failureMessage(latest),
        count: group.length,
        firstAt: group[0].at,
        lastAt: latest.at,
      };
    })
    .sort((a, b) => b.lastAt.localeCompare(a.lastAt))
    .slice(0, 5);
  return { kinds, messages };
}

export default function buildHealthReport(rows) {
  if (!rows.length) return { empty: true, venues: [], days: [], failures: [] };

  const days = [...new Set(rows.map((row) => row.day))].sort();

  // One ordered list of cycles for the whole report, with each venue's series
  // aligned to it by index. Every venue carrying its own timestamps made the
  // generated file 1MB of repeated ISO strings; this is the same information
  // at a fraction of the size, and it lines the sparklines up with each other
  // as a side effect - two venues that failed in the same cycle now show the
  // gap in the same column.
  const cycleAt = new Map();
  for (const row of rows) {
    const existing = cycleAt.get(row.cycle);
    if (!existing || row.at < existing) cycleAt.set(row.cycle, row.at);
  }
  const cycles = [...cycleAt.entries()]
    .map(([cycle, at]) => ({ cycle, at }))
    .sort((a, b) => a.at.localeCompare(b.at));

  const venues = [...groupBy(rows, (row) => row.venue)]
    .map(([venue, venueRows]) => {
      const ordered = [...venueRows].sort((a, b) => a.at.localeCompare(b.at));
      // Last row wins if a venue somehow reports twice in one cycle, matching
      // the "latest" figures reported beside the series.
      const byCycle = new Map(ordered.map((row) => [row.cycle, row]));
      const failures = ordered.filter(failed);
      const ok = ordered.filter((row) => !failed(row));
      const films = ok.map((row) => row.counts.films ?? 0);
      const granularity = ordered[ordered.length - 1].granularity;
      const metric = GRANULARITY_METRIC[granularity];

      return {
        venue,
        granularity,
        // Named rather than summed into a shared total - the page prints this
        // label beside the number so it is never read as comparable.
        metric: metric ?? null,
        probes: ordered.length,
        failures: failures.length,
        failureRate: round(rate(failures.length, ordered.length)),
        // A source that answers but with nothing is a different failure from
        // one that doesn't answer, and it's the quieter of the two.
        emptyAnswers: ok.filter((row) => (row.counts.films ?? 0) === 0).length,
        films: {
          latest: films.length ? films[films.length - 1] : null,
          median: films.length ? Math.round(percentile(films, 0.5)) : null,
          min: films.length ? Math.min(...films) : null,
          max: films.length ? Math.max(...films) : null,
        },
        dates: ok.length ? (ok[ok.length - 1].counts.dates ?? null) : null,
        metricValue:
          metric && ok.length ? (ok[ok.length - 1].counts[metric] ?? null) : null,
        durationMs: {
          median: ordered.length
            ? Math.round(percentile(ordered.map((row) => row.durationMs), 0.5))
            : null,
          p90: ordered.length
            ? Math.round(percentile(ordered.map((row) => row.durationMs), 0.9))
            : null,
        },
        requests: ordered.length ? Math.round(mean(ordered.map((row) => row.requests))) : null,
        lastProbedAt: ordered[ordered.length - 1].at,
        // Whether the source is failing right now, as opposed to having failed
        // at some point in the window - the question the overview asks.
        latestFailed: failed(ordered[ordered.length - 1]),
        // The unbroken run of failures the source is in now, if any: when it
        // started, how many probes long it is, and what the latest one said.
        currentOutage: currentOutage(ordered),
        failureSummary: summariseFailures(failures),
        // Films per cycle, indexed against the shared `cycles` list above -
        // the shape that shows a source quietly shedding listings before it
        // stops answering entirely.
        //
        // `null` is a gap: either the probe failed or this venue wasn't in
        // that cycle. The chart draws both as a break in the line rather than
        // a zero, because a source answering "no films" and a source not
        // answering are different things and a zero would merge them. Which
        // gaps were failures is in `failures` and the failure list, not here.
        series: cycles.map(({ cycle }) => {
          const row = byCycle.get(cycle);
          if (!row || failed(row)) return null;
          return row.counts.films ?? 0;
        }),
      };
    })
    .sort((a, b) => b.failureRate - a.failureRate || a.venue.localeCompare(b.venue));

  const allFailures = rows.filter(failed);
  // One point per probe cycle, which is hourly. A day's figure averages 24
  // cycles together, and a chain being blocked for a morning - every one of its
  // venues failing, cycle after cycle - flattened into a small bump. Aligned
  // with `cycles`, like the per-venue series.
  const rowsByCycle = groupBy(rows, (row) => row.cycle);
  const byCycle = cycles.map(({ cycle, at }) => {
    const cycleRows = rowsByCycle.get(cycle);
    const cycleFailures = cycleRows.filter(failed).length;
    return {
      at,
      probes: cycleRows.length,
      failures: cycleFailures,
      failureRate: round(rate(cycleFailures, cycleRows.length)),
    };
  });

  return {
    empty: false,
    window: {
      firstDay: days[0],
      lastDay: days[days.length - 1],
      days: days.length,
      cycles: cycles.length,
      probes: rows.length,
      venues: venues.length,
    },
    totals: {
      failures: allFailures.length,
      failureRate: round(rate(allFailures.length, rows.length)),
      venuesWithFailures: new Set(allFailures.map((row) => row.venue)).size,
      // Sources whose most recent probe came back with nothing. A source that
      // failed once a week ago and has answered every probe since is not
      // this.
      failingNow: venues.filter((venue) => venue.latestFailed).map((venue) => venue.venue),
    },
    byCycle,
    // Shared x-axis for every venue sparkline.
    cycles: cycles.map(({ at }) => at),
    venues,
    // Most recent first: what actually went wrong, with the message the probe
    // came back with rather than a count of anonymous failures.
    failures: allFailures
      .slice()
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 60)
      .map((row) => ({
        venue: row.venue,
        at: row.at,
        day: row.day,
        kind: failureKind(row),
        message: row.reason?.message ?? null,
        status: row.reason?.status ?? null,
        durationMs: row.durationMs,
      })),
  };
}
