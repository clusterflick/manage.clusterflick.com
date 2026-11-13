// Has a source stopped telling us about an accessibility provision?
//
// Every accessibility tag reaches a listing through a mapping somebody wrote:
// this attribute is audio description, that icon is a relaxed screening. When
// a venue renames the attribute, redesigns the page or changes its API, the
// mapping stops matching and the tag simply stops appearing. Nothing fails - a
// screening with no tags is a perfectly valid screening - so the only trace is
// that a share of the venue's programme which used to carry the tag no longer
// does.
//
// So this follows that share through time, per source and per tag, and flags
// the ones that have fallen away from where they used to sit. It found, before
// it existed, Cineworld's audio description going from 42% of performances to
// 2% across six weeks, and Omniplex losing its relaxed and kids' club markers
// to a site redesign.
//
// A flag is a prompt to look, not a verdict. A share moves with the programme
// as well as with the mapping: a venue that has just finished a season of
// foreign-language films has fewer subtitled screenings and nothing is wrong.
// The thresholds below are set to catch a mapping that broke rather than a
// programme that changed, and will sometimes catch the second.

import { ACCESSIBILITY_TAGS } from "./accessibility-history.mjs";
import {
  flagsOf,
  measureSources,
  overallShares,
  sourceRows,
  windowOf,
} from "./share-trend.mjs";

// "Now" is everything in the last week, pooled: one release can miss a monthly
// relaxed screening that the week as a whole still shows.
const RECENT_DAYS = 7;
// The baseline is what the source looked like before the last three weeks. The
// gap between the two keeps a decline that is still under way out of its own
// baseline, which is what let a slow one go unnoticed.
const BASELINE_GAP_DAYS = 21;
// A release where the source listed fewer performances than this says nothing
// reliable about a share of them.
const MIN_PERFORMANCES = 20;
// Fewer baseline releases than this and there is no "usual" to compare with.
const MIN_BASELINE_RELEASES = 4;

// A fall: the tag was on at least this share of performances, and is now on
// less than this fraction of that share.
const FALL_MIN_BASELINE = 0.02;
const FALL_RATIO = 0.35;
// Gone: the tag is on nothing now, and was there in at least this share of the
// baseline releases.
const GONE_MIN_PRESENCE = 0.6;
// Either way, only where the baseline share says the source should be listing
// at least this many tagged performances right now. A venue with one relaxed
// screening a month has none in most weeks, and that is not a finding.
const MIN_EXPECTED = 5;
// New: the tag was all but absent and is now on a fifth of the programme. Not
// a loss, but a mapping that has started over-matching looks like this too.
const NEW_MAX_BASELINE = 0.02;
const NEW_MAX_PRESENCE = 0.1;
const NEW_MIN_SHARE = 0.2;

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

export default function buildAccessibilityReport({ history, venues }) {
  if (!history.length) return { empty: true };

  const sources = measureSources({
    history,
    venues,
    keys: ACCESSIBILITY_TAGS,
    thresholds: THRESHOLDS,
  });
  const flags = flagsOf(sources);
  const overall = overallShares(history, ACCESSIBILITY_TAGS);

  return {
    empty: false,
    window: windowOf(history, THRESHOLDS),
    releases: history.map(({ tag, publishedAt }) => ({ tag, publishedAt })),
    tags: ACCESSIBILITY_TAGS.map((tag) => {
      const points = overall[tag];
      const last = points[points.length - 1];
      return {
        tag,
        tagged: last.tagged,
        performances: last.performances,
        share: last.share,
        series: points.map(({ share }) => share),
      };
    }),
    totals: {
      lost: flags.filter(({ kind }) => kind !== "new").length,
      appeared: flags.filter(({ kind }) => kind === "new").length,
      sourcesMeasured: sources.length,
    },
    flags,
    sources: sourceRows(sources),
  };
}
