// Has a rating source stopped giving us ratings?
//
// match takes every film in the catalogue to six sources and keeps what each
// says about it. A source breaks the way a venue's accessibility mapping does:
// the site changes, our reading of it stops working, and nothing fails. When
// Rotten Tomatoes renamed its score field on 4 November 2026, all 1,197 films
// still matched and every one was published with no score - the website showed
// no Rotten Tomatoes rating anywhere, for a week, and the only trace was a
// number that went from 77% to nothing.
//
// match now refuses to publish a source with no matches, or none carrying a
// score. This is for everything short of that: a source whose share of scored
// matches, or whose number of matches, falls well below where it usually sits.
//
// The thresholds were set against the 90 daily releases from 14 August to
// 11 November 2026. Outside the Rotten Tomatoes break, the lowest any source's
// scored share fell in a single release was 82% of its usual level
// (Letterboxd, which has days where many new films have too few ratings), and
// the lowest its match count fell was 86% (the programme moves). Both lines
// sit below that, so a flag is a break rather than a quiet day.

import { MATCHED_SOURCES } from "./matched-history.mjs";
import { median, rate, round } from "./stats.mjs";

const DAY_MS = 86400000;

// The baseline is what the source looked like before the last fortnight, so a
// break that has been going on for days is not already part of its own "usual".
const BASELINE_GAP_DAYS = 14;
// Fewer baseline releases than this and there is no "usual" to compare with.
const MIN_BASELINE_RELEASES = 5;
// Flag a fall below this fraction of the usual level.
const FALL_RATIO = 0.75;

// Most severe first; a source carries every one that applies.
const KIND_ORDER = {
  missing: 0,
  unscored: 1,
  "scores-fell": 2,
  "matches-fell": 3,
};

// The release a condition has held since: the first of the run of releases,
// ending at the latest, in which it holds.
function sinceOf(history, holds) {
  let since = null;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (!holds(history[index])) break;
    since = history[index].publishedAt;
  }
  return since;
}

export default function buildMatchedReport({ history }) {
  if (!history.length) return { empty: true };

  const latest = history[history.length - 1];
  const latestAt = new Date(latest.publishedAt).getTime();
  const first = history[0];
  const baselineBefore = latestAt - BASELINE_GAP_DAYS * DAY_MS;
  const baselineReleases = history.filter(
    (release) => new Date(release.publishedAt).getTime() < baselineBefore,
  );

  const shareOf = (counts) =>
    counts && counts.matched > 0 ? rate(counts.scored, counts.matched) : null;

  const flags = [];
  const sources = Object.keys(MATCHED_SOURCES).map((source) => {
    const countsIn = (release) => release.sources[source] ?? null;
    const current = countsIn(latest);
    const baselineCounts = baselineReleases.map(countsIn).filter(Boolean);
    const baseline =
      baselineCounts.length >= MIN_BASELINE_RELEASES
        ? {
            matched: Math.round(
              median(baselineCounts.map(({ matched }) => matched)),
            ),
            share: round(median(baselineCounts.map(shareOf))),
          }
        : null;

    const raise = (kind, holds) =>
      flags.push({
        key: `${source}|${kind}`,
        source,
        kind,
        since: sinceOf(history, holds),
      });

    if (!current) {
      raise("missing", (release) => !countsIn(release));
    } else if (current.matched > 0 && current.scored === 0) {
      raise("unscored", (release) => {
        const counts = countsIn(release);
        return Boolean(counts) && counts.matched > 0 && counts.scored === 0;
      });
    } else if (baseline) {
      if (shareOf(current) < baseline.share * FALL_RATIO) {
        raise(
          "scores-fell",
          (release) =>
            (shareOf(countsIn(release)) ?? 0) < baseline.share * FALL_RATIO,
        );
      }
      if (current.matched < baseline.matched * FALL_RATIO) {
        raise(
          "matches-fell",
          (release) =>
            (countsIn(release)?.matched ?? 0) < baseline.matched * FALL_RATIO,
        );
      }
    }

    return {
      source,
      latest: current
        ? {
            matched: current.matched,
            scored: current.scored,
            share: round(shareOf(current) ?? 0),
          }
        : null,
      baseline,
      matchedSeries: history.map(
        (release) => countsIn(release)?.matched ?? null,
      ),
      shareSeries: history.map((release) => {
        const share = shareOf(countsIn(release));
        return share === null ? null : round(share);
      }),
    };
  });

  flags.sort(
    (a, b) =>
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      a.source.localeCompare(b.source),
  );

  return {
    empty: false,
    window: {
      releases: history.length,
      firstAt: first.publishedAt,
      lastAt: latest.publishedAt,
      days: Math.round(
        (latestAt - new Date(first.publishedAt).getTime()) / DAY_MS,
      ),
      baselineGapDays: BASELINE_GAP_DAYS,
      fallRatio: FALL_RATIO,
    },
    releases: history.map(({ tag, publishedAt }) => ({ tag, publishedAt })),
    flags,
    sources,
  };
}
