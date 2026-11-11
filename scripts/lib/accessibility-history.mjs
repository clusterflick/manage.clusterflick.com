// Which data-combined releases the accessibility trend reads, and what it
// keeps of each.
//
// The trend asks one question of every source: what share of its performances
// carry each accessibility tag, and has that share fallen away? A venue mapping
// that silently stops matching looks exactly like this - Cineworld's audio
// description went from 42% of performances to 2% over six weeks without
// anything failing - and nothing that looks at a single release can see it.
//
// It needs a long window and a sparse one. Long, because the baseline has to
// predate a decline that can take weeks. Sparse, because each release is
// around 25MB and a share of a venue's programme does not move by the hour. So:
// the last release of each of the most recent days, and the last release of
// each week before that.

import { londonDay } from "./stats.mjs";

// Bumped whenever accessibilitySnapshotOf keeps something new, so a cached
// snapshot missing it is rebuilt rather than read as though it were empty.
export const ACCESSIBILITY_SNAPSHOT_VERSION = 1;

export const ACCESSIBILITY_TAGS = [
  "audioDescription",
  "babyFriendly",
  "dogFriendly",
  "hardOfHearing",
  "relaxed",
  "subtitled",
];

const DAY_MS = 86400000;

// The Monday of the week a London day falls in, as YYYY-MM-DD. Days are
// compared as UTC midnights of their London date, so a clock change can't move
// a day into the wrong week.
function weekOf(day) {
  const date = new Date(`${day}T00:00:00Z`);
  const sinceMonday = (date.getUTCDay() + 6) % 7;
  return new Date(date.getTime() - sinceMonday * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

// `releases` in any order; returns the chosen ones oldest first.
export function pickAccessibilityReleases(
  releases,
  { now = Date.now(), dailyDays, weeks },
) {
  const today = new Date(`${londonDay(now)}T00:00:00Z`).getTime();
  const dailyFrom = today - (dailyDays - 1) * DAY_MS;
  const weeklyFrom = today - weeks * 7 * DAY_MS;

  // Published order, so a later release in the same bucket replaces an earlier.
  const sorted = [...releases].sort((a, b) =>
    a.published_at.localeCompare(b.published_at),
  );
  const buckets = new Map();
  for (const release of sorted) {
    const day = londonDay(release.published_at);
    const at = new Date(`${day}T00:00:00Z`).getTime();
    if (at < weeklyFrom || at > today) continue;
    buckets.set(
      at >= dailyFrom ? `day:${day}` : `week:${weekOf(day)}`,
      release,
    );
  }
  return [...buckets.values()].sort((a, b) =>
    a.published_at.localeCompare(b.published_at),
  );
}

// Per venue: how many performances it lists, and how many carry each tag.
export function accessibilitySnapshotOf(combined) {
  const venues = {};
  for (const movie of Object.values(combined.movies)) {
    for (const performance of movie.performances) {
      const venueId = movie.showings[performance.showingId]?.venueId;
      if (!venueId) continue;
      const venue = (venues[venueId] ??= { performances: 0, tags: {} });
      venue.performances += 1;
      for (const tag of ACCESSIBILITY_TAGS) {
        if (performance.accessibility?.[tag]) {
          venue.tags[tag] = (venue.tags[tag] ?? 0) + 1;
        }
      }
    }
  }
  return {
    version: ACCESSIBILITY_SNAPSHOT_VERSION,
    generatedAt: combined.generatedAt,
    venues,
  };
}
