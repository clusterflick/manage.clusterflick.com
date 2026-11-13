// The share of each source's performances that carry a label, followed through
// time, and flagged where it has fallen away from where it used to sit.
//
// Shared by the accessibility and occasions trends. Both labels reach a
// listing by a route that can stop working without failing anything - a venue
// mapping for accessibility, a reading of the venue's own words for occasions
// - so in both a falling share is the only trace a break leaves. What differs
// between them is which labels are counted and how rare they are, so each
// passes its own keys and thresholds.
//
// A snapshot is `{ venues: { [venueId]: { performances, tags: { [key]: n } } } }`
// and a history is those snapshots, oldest first, each with a `publishedAt`.

import { median, rate, round } from "./stats.mjs";

const DAY_MS = 86400000;

export const KIND_ORDER = { gone: 0, fall: 1, new: 2 };

// A chain's venues share one site and one mapping, so they break together:
// twelve Cineworlds losing a tag is one finding, not twelve. Each venue is
// still its own source as well, for the one cinema in a chain that differs.
function sourcesOf(venues) {
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

function assess({ series, counts, history, latestAt, thresholds: t }) {
  const recentFrom = latestAt - t.recentDays * DAY_MS;
  const baselineBefore = latestAt - t.baselineGapDays * DAY_MS;

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
    baselineShares.length < t.minBaselineReleases ||
    recentPerformances < t.minPerformances
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
    presence >= t.goneMinPresence &&
    expected >= t.minExpected
  ) {
    kind = "gone";
  } else if (
    baseline >= t.fallMinBaseline &&
    current < baseline * t.fallRatio &&
    expected >= t.minExpected
  ) {
    kind = "fall";
  } else if (
    baseline < t.newMaxBaseline &&
    presence <= t.newMaxPresence &&
    current >= t.newMinShare
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

// Every source with enough on to measure, and for each of `keys` it has ever
// carried: its share per release, and what the trend makes of it.
export function measureSources({ history, venues, keys, thresholds }) {
  const latestAt = new Date(history[history.length - 1].publishedAt).getTime();
  const sources = [];
  for (const source of sourcesOf(venues)) {
    const perRelease = history.map((release) => countsFor(source, release));
    const latestCounts = perRelease[perRelease.length - 1];
    // A source that has never listed enough to measure isn't worth a row.
    if (
      !perRelease.some(
        ({ performances }) => performances >= thresholds.minPerformances,
      )
    ) {
      continue;
    }

    const tags = {};
    for (const tag of keys) {
      const counts = perRelease.map(({ performances, tags: tagged }) => ({
        performances,
        tagged: tagged[tag] ?? 0,
      }));
      if (!counts.some(({ tagged }) => tagged > 0)) continue;
      const series = counts.map(({ performances, tagged }) =>
        performances >= thresholds.minPerformances
          ? round(rate(tagged, performances))
          : null,
      );
      const assessment = assess({
        series,
        counts,
        history,
        latestAt,
        thresholds,
      });
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
  return sources;
}

// The flags across every source, most severe first. A chain's finding stands
// for its venues: a venue is only flagged on its own where its chain is not
// flagged for the same key.
export function flagsOf(sources) {
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
  return flags.sort(
    (a, b) =>
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      b.performances - a.performances ||
      a.key.localeCompare(b.key),
  );
}

// Across everything, per key: the share of all performances carrying it, one
// point per release.
export function overallShares(history, keys) {
  return Object.fromEntries(
    keys.map((tag) => [
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
}

// The sources table: chains first, then the busiest venues - the table a
// reader scans for a share that looks wrong without having tripped a
// threshold.
export function sourceRows(sources) {
  return sources
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
    }));
}

export function windowOf(history, thresholds) {
  const first = history[0];
  const latest = history[history.length - 1];
  return {
    releases: history.length,
    firstAt: first.publishedAt,
    lastAt: latest.publishedAt,
    days: Math.round(
      (new Date(latest.publishedAt).getTime() -
        new Date(first.publishedAt).getTime()) /
        DAY_MS,
    ),
    recentDays: thresholds.recentDays,
    baselineGapDays: thresholds.baselineGapDays,
  };
}
