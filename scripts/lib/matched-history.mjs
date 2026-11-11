// Which data-matched releases the matching trend reads, and what it keeps of
// each.
//
// A rating source can break without anything failing. When Rotten Tomatoes
// renamed its scorecard's `score` to `scorePercent` in November 2026, every
// film still matched - 1,138 of them - and every one was published with a null
// score, which the website reads as no rating at all. Nothing that looks at a
// single release can tell that from a quiet day, and match now refuses to
// publish a source with no scores at all (clusterflick/scripts,
// scripts/match/check-matched-data.js). A partial fall gets past that, and is
// what this follows: per source, how many films matched, and how many of those
// carry the score the website shows.
//
// data-matched publishes once a day and every asset is small (the largest is
// under 1MB), so this reads the last release of each day and keeps two numbers
// per source.

import { londonDay } from "./stats.mjs";

// Bumped whenever matchedSnapshotOf keeps something new, so a cached snapshot
// missing it is rebuilt rather than read as though it were empty.
export const MATCHED_SNAPSHOT_VERSION = 1;

const isNumber = (value) => typeof value === "number" && !Number.isNaN(value);

// The figure the website shows for each source - the one a match exists for.
// The same as SCORE_OF in clusterflick/scripts'
// scripts/match/check-matched-data.js: change one, change the other.
export const MATCHED_SOURCES = {
  bechdel: (match) => match.rating,
  imdb: (match) => match.rating,
  letterboxd: (match) => match.rating,
  metacritic: (match) => match.critics?.rating,
  moviedb: (match) => match.rating,
  rottentomatoes: (match) => match.critics?.all?.score,
};

// `releases` in any order; returns the last of each London day within the
// window, oldest first.
export function pickMatchedReleases(releases, { now = Date.now(), days }) {
  const today = londonDay(now);
  const from = londonDay(now - (days - 1) * 86400000);
  // A draft has no published_at, and is not a release anything reads.
  const sorted = releases
    .filter((release) => !release.draft && release.published_at)
    .sort((a, b) => a.published_at.localeCompare(b.published_at));
  const byDay = new Map();
  for (const release of sorted) {
    const day = londonDay(release.published_at);
    if (day < from || day > today) continue;
    byDay.set(day, release);
  }
  return [...byDay.values()];
}

// `files` maps a source to its parsed asset. A source missing from the release
// is left out rather than counted as zero, so the report can say it is missing.
export function matchedSnapshotOf(files) {
  const sources = {};
  for (const [source, scoreOf] of Object.entries(MATCHED_SOURCES)) {
    const data = files[source];
    if (!data) continue;
    const matches = Object.values(data);
    sources[source] = {
      matched: matches.length,
      scored: matches.filter((match) => isNumber(scoreOf(match))).length,
    };
  }
  return { version: MATCHED_SNAPSHOT_VERSION, sources };
}
