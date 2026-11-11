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
import { median, rate, round } from "./stats.mjs";

const DAY_MS = 86400000;

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

const KIND_ORDER = { gone: 0, fall: 1, new: 2 };

function sourcesOf(venues) {
  // A chain's venues share one site and one mapping, so they break together:
  // twelve Cineworlds losing a tag is one finding, not twelve. Each venue is
  // still its own source as well, for the one cinema in a chain that differs.
  const sources = new Map();
  const byGroup = new Map();
  for (const venue of Object.values(venues)) {
    sources.set(`venue:${venue.id}`, {
      key: `venue:${venue.id}`,
      kind: "venue",
      name: venue.name,
      id: venue.id,
      chain: venue.groupName ?? null,
      venueIds: [venue.id],
    });
    if (venue.groupName) {
      if (!byGroup.has(venue.groupName)) byGroup.set(venue.groupName, []);
      byGroup.get(venue.groupName).push(venue.id);
    }
  }
  for (const [groupName, venueIds] of byGroup) {
    if (venueIds.length < 2) continue;
    sources.set(`chain:${groupName}`, {
      key: `chain:${groupName}`,
      kind: "chain",
      name: groupName,
      id: null,
      chain: groupName,
      venueIds,
    });
  }
  return [...sources.values()];
}

function countsFor(source, snapshot) {
  let performances = 0;
  const tags = {};
  for (const venueId of source.venueIds) {
    const venue = snapshot.venues[venueId];
    if (!venue) continue;
    performances += venue.performances;
    for (const [tag, count] of Object.entries(venue.tags)) {
      tags[tag] = (tags[tag] ?? 0) + count;
    }
  }
  return { performances, tags };
}

function assess({ series, counts, history, latestAt }) {
  const recentFrom = latestAt - RECENT_DAYS * DAY_MS;
  const baselineBefore = latestAt - BASELINE_GAP_DAYS * DAY_MS;

  const baselineShares = [];
  let recentTagged = 0;
  let recentPerformances = 0;
  history.forEach((release, index) => {
    const at = new Date(release.publishedAt).getTime();
    const { performances, tagged } = counts[index];
    if (at >= recentFrom) {
      recentTagged += tagged;
      recentPerformances += performances;
    } else if (at < baselineBefore && series[index] !== null) {
      baselineShares.push(series[index]);
    }
  });

  const latestPerformances = counts[counts.length - 1].performances;
  if (
    baselineShares.length < MIN_BASELINE_RELEASES ||
    recentPerformances < MIN_PERFORMANCES
  ) {
    return { baseline: null, current: null, presence: null, kind: null };
  }

  const baseline = median(baselineShares);
  const presence = rate(
    baselineShares.filter((share) => share > 0).length,
    baselineShares.length,
  );
  const current = rate(recentTagged, recentPerformances);

  const expected = baseline * latestPerformances;

  let kind = null;
  if (
    current === 0 &&
    presence >= GONE_MIN_PRESENCE &&
    expected >= MIN_EXPECTED
  ) {
    kind = "gone";
  } else if (
    baseline >= FALL_MIN_BASELINE &&
    current < baseline * FALL_RATIO &&
    expected >= MIN_EXPECTED
  ) {
    kind = "fall";
  } else if (
    baseline < NEW_MAX_BASELINE &&
    presence <= NEW_MAX_PRESENCE &&
    current >= NEW_MIN_SHARE
  ) {
    kind = "new";
  }

  return {
    baseline: round(baseline),
    current: round(current),
    presence: round(presence, 2),
    kind,
  };
}

// The first release after which the share never got back to half its baseline
// - roughly when it went wrong, which is the thing to line up against a commit
// or a venue's redesign.
function changedAt(series, baseline, history) {
  let since = null;
  for (let index = series.length - 1; index >= 0; index -= 1) {
    const share = series[index];
    if (share === null) continue;
    if (share >= baseline * 0.5) break;
    since = history[index].publishedAt;
  }
  return since;
}

export default function buildAccessibilityReport({ history, venues }) {
  if (!history.length) return { empty: true };

  const latest = history[history.length - 1];
  const latestAt = new Date(latest.publishedAt).getTime();
  const first = history[0];

  const sources = [];
  for (const source of sourcesOf(venues)) {
    const perRelease = history.map((release) => countsFor(source, release));
    const latestCounts = perRelease[perRelease.length - 1];
    // A source that has never listed enough to measure isn't worth a row.
    if (
      !perRelease.some(({ performances }) => performances >= MIN_PERFORMANCES)
    ) {
      continue;
    }

    const tags = {};
    for (const tag of ACCESSIBILITY_TAGS) {
      const counts = perRelease.map(({ performances, tags: tagged }) => ({
        performances,
        tagged: tagged[tag] ?? 0,
      }));
      if (!counts.some(({ tagged }) => tagged > 0)) continue;
      const series = counts.map(({ performances, tagged }) =>
        performances >= MIN_PERFORMANCES
          ? round(rate(tagged, performances))
          : null,
      );
      const assessment = assess({ series, counts, history, latestAt });
      tags[tag] = {
        latest: latestCounts.tags[tag] ?? 0,
        series,
        ...assessment,
        since:
          assessment.kind === "gone" || assessment.kind === "fall"
            ? changedAt(series, assessment.baseline, history)
            : null,
      };
    }

    sources.push({
      key: source.key,
      kind: source.kind,
      name: source.name,
      id: source.id,
      chain: source.chain,
      venues: source.venueIds.length,
      performances: latestCounts.performances,
      tags,
    });
  }

  // A chain's finding stands for its venues: a venue is only flagged on its own
  // where its chain is not flagged for the same tag.
  const chainFlags = new Set();
  for (const source of sources) {
    if (source.kind !== "chain") continue;
    for (const [tag, { kind }] of Object.entries(source.tags)) {
      if (kind) chainFlags.add(`${source.name}|${tag}`);
    }
  }

  const flags = [];
  for (const source of sources) {
    for (const [tag, detail] of Object.entries(source.tags)) {
      if (!detail.kind) continue;
      if (
        source.kind === "venue" &&
        source.chain &&
        chainFlags.has(`${source.chain}|${tag}`)
      ) {
        continue;
      }
      flags.push({
        key: `${source.key}|${tag}`,
        source: {
          key: source.key,
          kind: source.kind,
          name: source.name,
          id: source.id,
          venues: source.venues,
        },
        tag,
        kind: detail.kind,
        baseline: detail.baseline,
        current: detail.current,
        latest: detail.latest,
        performances: source.performances,
        since: detail.since,
        series: detail.series,
      });
    }
  }
  flags.sort(
    (a, b) =>
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      b.performances - a.performances ||
      a.key.localeCompare(b.key),
  );

  // Across everything, per tag: the share of all performances carrying it.
  const overall = Object.fromEntries(
    ACCESSIBILITY_TAGS.map((tag) => [
      tag,
      history.map((release) => {
        let performances = 0;
        let tagged = 0;
        for (const venue of Object.values(release.venues)) {
          performances += venue.performances;
          tagged += venue.tags[tag] ?? 0;
        }
        return {
          performances,
          tagged,
          share: round(rate(tagged, performances)),
        };
      }),
    ]),
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
      recentDays: RECENT_DAYS,
      baselineGapDays: BASELINE_GAP_DAYS,
    },
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
    // Chains first, then the busiest venues: the table a reader scans for a
    // share that looks wrong without having tripped a threshold.
    sources: sources
      .filter(({ tags }) => Object.keys(tags).length > 0)
      .sort(
        (a, b) =>
          (a.kind === "chain" ? 0 : 1) - (b.kind === "chain" ? 0 : 1) ||
          b.performances - a.performances,
      )
      .map(({ tags, ...source }) => ({
        ...source,
        tags: Object.fromEntries(
          Object.entries(tags).map(
            ([tag, { latest: count, series, baseline, current, kind }]) => [
              tag,
              { latest: count, series, baseline, current, kind },
            ],
          ),
        ),
      })),
  };
}
