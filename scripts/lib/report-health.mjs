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
  const byKind = [...groupBy(allFailures, (row) => row.reason?.kind ?? "no-counts")]
    .map(([kind, group]) => ({
      kind,
      count: group.length,
      venues: [...new Set(group.map((row) => row.venue))].sort(),
    }))
    .sort((a, b) => b.count - a.count);

  const byDay = days.map((day) => {
    const dayRows = rows.filter((row) => row.day === day);
    const dayFailures = dayRows.filter(failed);
    return {
      day,
      probes: dayRows.length,
      failures: dayFailures.length,
      failureRate: round(rate(dayFailures.length, dayRows.length)),
      cycles: new Set(dayRows.map((row) => row.cycle)).size,
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
    },
    byKind,
    byDay,
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
        kind: row.reason?.kind ?? "no-counts",
        message: row.reason?.message ?? null,
        status: row.reason?.status ?? null,
        durationMs: row.durationMs,
      })),
  };
}
