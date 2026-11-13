// Has a source stopped telling us what makes a screening an occasion?
//
// `performance.occasions` records an intro, a Q&A, a live score, a premiere.
// Two venues pass structured tags for it (Indy Cinema Group, Riverside); every
// other occasion is read by the rules in clusterflick/scripts'
// common/occasions.js from the listing's title, notes and description. So a
// share can fall for three reasons, and none of them fails anything:
//
// - the venue reworded its pages, so a rule no longer matches;
// - the retrieve stopped fetching the description the rules read;
// - a change to the rules stopped matching what it used to.
//
// The third is the likeliest while the rules are young, which is why every
// commit to them is drawn against the trend, and a flag says when one landed
// beside it. A share that suddenly appears matters as much as one that falls:
// a rule that starts reading a synopsis as an intro puts that film on the
// website's home page.
//
// The method is the accessibility trend's (`share-trend.mjs`), with the
// thresholds below.

import { OCCASION_KEYS } from "./occasions-history.mjs";
import {
  flagsOf,
  measureSources,
  overallShares,
  sourceRows,
  windowOf,
} from "./share-trend.mjs";
import { rate, round } from "./stats.mjs";

const DAY_MS = 86400000;

// As accessibility: the last week pooled is "now", and the baseline is what
// came before the last three weeks.
const RECENT_DAYS = 7;
const BASELINE_GAP_DAYS = 21;
const MIN_PERFORMANCES = 20;
const MIN_BASELINE_RELEASES = 4;

// Falls and losses as accessibility, including only flagging where the
// baseline expects at least five occasions in the latest release. Occasions
// sit on about 2% of all performances, so that leaves out most single venues
// for most kinds - a venue with a Q&A a month has none in most weeks, and that
// is not a finding. "Any occasion" and the chains are what this can measure.
const FALL_MIN_BASELINE = 0.02;
const FALL_RATIO = 0.35;
const GONE_MIN_PRESENCE = 0.6;
const MIN_EXPECTED = 5;
// New: half accessibility's bar. A subtitled screening on a fifth of a
// programme is ordinary; an occasion on a tenth of one where there were all
// but none is a rule reading something it shouldn't, or a season worth
// knowing about.
const NEW_MAX_BASELINE = 0.02;
const NEW_MAX_PRESENCE = 0.1;
const NEW_MIN_SHARE = 0.1;

const THRESHOLDS = {
  recentDays: RECENT_DAYS,
  baselineGapDays: BASELINE_GAP_DAYS,
  minPerformances: MIN_PERFORMANCES,
  minBaselineReleases: MIN_BASELINE_RELEASES,
  fallMinBaseline: FALL_MIN_BASELINE,
  fallRatio: FALL_RATIO,
  goneMinPresence: GONE_MIN_PRESENCE,
  minExpected: MIN_EXPECTED,
  newMaxBaseline: NEW_MAX_BASELINE,
  newMaxPresence: NEW_MAX_PRESENCE,
  newMinShare: NEW_MIN_SHARE,
};

// The first release after which the share stayed at half the "new" bar or
// above - when it appeared, for lining up against a rule change.
function appearedAt(series, history) {
  let since = null;
  for (let index = series.length - 1; index >= 0; index -= 1) {
    const share = series[index];
    if (share === null) continue;
    if (share < NEW_MIN_SHARE / 2) break;
    since = history[index].publishedAt;
  }
  return since;
}

// The release each rule change first reached: the first published after the
// commit. The scripts are installed fresh by every transform, so a merged
// change reaches the next release - and is drawn there, not at the commit,
// which can fall between two points of the trend.
function placeRules(rules, history, after) {
  return rules
    .filter((rule) => !after || rule.committedAt > after)
    .map((rule) => {
      const index = history.findIndex(
        (release) => release.publishedAt > rule.committedAt,
      );
      return { ...rule, releaseIndex: index === -1 ? null : index };
    })
    .filter((rule) => rule.releaseIndex !== null);
}

export default function buildOccasionsReport({ history, venues, rules }) {
  // Releases from before `occasions` was published carry none, which would
  // read as every occasion vanishing. The trend starts at the first release
  // that carried any; one after it carrying none is a loss, and counted.
  const firstPublished = history.findIndex((release) => release.published);
  if (firstPublished === -1) return { empty: true };
  const trend = history.slice(firstPublished);

  const sources = measureSources({
    history: trend,
    venues,
    keys: OCCASION_KEYS,
    thresholds: THRESHOLDS,
  });
  // A change from before the release ahead of the trend's first reached a
  // release the trend doesn't show.
  const placed = placeRules(
    rules,
    trend,
    history[firstPublished - 1]?.publishedAt ?? null,
  );
  const flags = flagsOf(sources).map((flag) => {
    const since =
      flag.kind === "new" ? appearedAt(flag.series, trend) : flag.since;
    // The rule change that reached the release the share changed at, if one
    // did: the first thing to rule out before blaming the venue.
    const index = since
      ? trend.findIndex((release) => release.publishedAt === since)
      : -1;
    const rule = placed.findLast(
      (candidate) => candidate.releaseIndex === index,
    );
    return {
      ...flag,
      since,
      rule: rule
        ? { sha: rule.sha, message: rule.message, url: rule.url }
        : null,
    };
  });
  const overall = overallShares(trend, OCCASION_KEYS);

  // Of the performances with an occasion, how many name who is involved. The
  // rules leave out a name they can't be sure of, so this falls when a change
  // starts dropping names, and rises when one starts reading garbage as one.
  const named = trend.map((release) => {
    let occasions = 0;
    let withNames = 0;
    for (const venue of Object.values(release.venues)) {
      occasions += venue.tags.any ?? 0;
      withNames += venue.named ?? 0;
    }
    return { occasions, withNames, share: round(rate(withNames, occasions)) };
  });

  const window = windowOf(trend, THRESHOLDS);
  const measured = sources.some((source) =>
    Object.values(source.tags).some(({ baseline }) => baseline !== null),
  );
  const lastNamed = named[named.length - 1];

  return {
    empty: false,
    window: {
      ...window,
      publishedFrom: trend[0].publishedAt,
      // Flags need four baseline releases older than the gap, and releases
      // that old are a week apart: about six weeks from the first release
      // carrying occasions, give or take the week its first one fell in.
      flagsFrom: measured
        ? null
        : new Date(
            new Date(trend[0].publishedAt).getTime() +
              ((MIN_BASELINE_RELEASES - 1) * 7 + BASELINE_GAP_DAYS) * DAY_MS,
          ).toISOString(),
    },
    releases: trend.map(({ tag, publishedAt }) => ({ tag, publishedAt })),
    kinds: OCCASION_KEYS.map((kind) => {
      const points = overall[kind];
      const last = points[points.length - 1];
      return {
        kind,
        tagged: last.tagged,
        performances: last.performances,
        share: last.share,
        series: points.map(({ share }) => share),
      };
    }),
    named: {
      occasions: lastNamed.occasions,
      withNames: lastNamed.withNames,
      share: lastNamed.share,
      series: named.map(({ share }) => share),
    },
    rules: placed.map(({ sha, message, committedAt, url, releaseIndex }) => ({
      sha,
      message,
      committedAt,
      url,
      releaseIndex,
    })),
    totals: {
      lost: flags.filter(({ kind }) => kind !== "new").length,
      appeared: flags.filter(({ kind }) => kind === "new").length,
      sourcesMeasured: sources.length,
    },
    flags,
    sources: sourceRows(sources),
  };
}
