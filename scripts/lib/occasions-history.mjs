// What the occasions trend keeps of each data-combined release.
//
// It reads the same releases as the accessibility trend - the last of each
// recent day, the last of each week before that (`pickAccessibilityReleases`)
// - and the fetch step reduces each one to both snapshots from a single
// download, so following occasions costs no extra release downloads once its
// cache is warm.
//
// A performance's `occasions` (an intro, a Q&A, a live score - see
// docs/occasions.md in clusterflick/scripts) are mostly read from the venue's
// own words by our rules rather than mapped from a venue's tags, so a share
// can fall because a venue reworded its pages, because a retrieve stopped
// fetching the description the rules read, or because a change to the rules
// stopped matching. Each of those fails nothing.

// Bumped whenever occasionsSnapshotOf keeps something new, so a cached
// snapshot missing it is rebuilt rather than read as though it were empty.
export const OCCASIONS_SNAPSHOT_VERSION = 1;

// The kinds the pipeline publishes, as `performance.occasions` keys.
export const OCCASION_KINDS = [
  "intro",
  "qAndA",
  "inConversation",
  "panel",
  "guestAppearance",
  "liveScore",
  "premiere",
  "preview",
];

// A performance with any occasion at all. Occasions are rare - under 2% of
// performances - so a single kind at a single venue is usually too few to
// measure, while all of them together often isn't.
export const ANY_OCCASION = "any";

export const OCCASION_KEYS = [ANY_OCCASION, ...OCCASION_KINDS];

// Per venue: how many performances it lists, how many carry each occasion
// kind (and any at all), and how many of those name the people involved.
//
// `published` says whether the release carried the field at all. `combine`
// leaves `occasions` off a performance with none, so a release from before the
// field existed reads exactly like one where every occasion has vanished - the
// one thing this trend exists to flag. So the trend starts at the first
// release that carried any, and drops only the releases before it: one after
// it with none is a real loss, and is counted.
export function occasionsSnapshotOf(combined) {
  const venues = {};
  let published = false;
  for (const movie of Object.values(combined.movies)) {
    for (const performance of movie.performances) {
      const venueId = movie.showings[performance.showingId]?.venueId;
      if (!venueId) continue;
      const venue = (venues[venueId] ??= {
        performances: 0,
        tags: {},
        named: 0,
      });
      venue.performances += 1;
      const occasions = performance.occasions;
      if (!occasions) continue;
      published = true;
      let any = false;
      let named = false;
      for (const kind of OCCASION_KINDS) {
        const detail = occasions[kind];
        if (!detail) continue;
        any = true;
        venue.tags[kind] = (venue.tags[kind] ?? 0) + 1;
        if (detail !== true && (detail.guests || detail.performers)) {
          named = true;
        }
      }
      if (any) venue.tags[ANY_OCCASION] = (venue.tags[ANY_OCCASION] ?? 0) + 1;
      if (named) venue.named += 1;
    }
  }
  return {
    version: OCCASIONS_SNAPSHOT_VERSION,
    generatedAt: combined.generatedAt,
    published,
    venues,
  };
}
