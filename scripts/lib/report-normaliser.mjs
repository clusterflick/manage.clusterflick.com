// Matched listings whose title and TMDB title normalise differently.
//
// The matcher accepts a TMDB search result outright only when
// `normalizeTitle(result.title)` (or its original title) equals the listing's
// normalised title. When nothing does, it falls back to the LLM - reviewing the
// search results, or asking for the film outright - and failing that to a
// forced match. So a listing that matched while its title and the TMDB title
// still normalise apart almost always matched through the LLM, and every one
// that is a normaliser gap (an article, a spacing, a spelling) is a call the
// next run could skip if the normaliser were corrected instead.
//
// Read from data-transformed rather than combined-data, because transform is
// the step that matched, and its output still carries the title the venue gave
// alongside the TMDB title it matched to.

import { groupBy } from "./stats.mjs";
import { movieUrl } from "./clusterflick-urls.mjs";

// The matcher's own split of a trailing "(1965)" off the normalised title
// (common/utils.js getMovieTitleAndYearFrom in the scripts repo).
const withoutYear = (title) => {
  const match = title.trim().match(/^(.*?)\s*\((\d{4})\)$/);
  return match ? match[1].trim() : title;
};

// A rough reading of what separates the two, so the ones a normaliser rule
// would fix sort apart from the ones that really are different titles.
function kindOf(venue, tmdb) {
  const bare = (title) => title.replace(/^(the|a|an) /, "");
  if (bare(venue) === bare(tmdb)) return "article";
  if (venue.replace(/ /g, "") === tmdb.replace(/ /g, "")) return "spacing";
  if (venue.includes(tmdb) || tmdb.includes(venue)) return "extra words";
  return "different title";
}

export default function buildNormaliserReport({
  transformed,
  normalizeTitle,
  combined,
  venues,
  source,
}) {
  const normalise = (title) => withoutYear(normalizeTitle(title, { retainYear: true }));

  let checked = 0;
  const mismatched = [];
  for (const [venueId, listings] of Object.entries(transformed)) {
    for (const listing of listings) {
      // Multi-film listings match each part separately, against a title the
      // transform split out rather than the one the venue gave.
      if (!listing.themoviedb) continue;
      checked += 1;
      const venueTitle = normalise(listing.title);
      const tmdbTitle = normalizeTitle(listing.themoviedb.title);
      const movie = combined.movies[String(listing.themoviedb.id)];
      if (venueTitle === tmdbTitle) continue;
      if (movie?.originalTitle && normalizeTitle(movie.originalTitle) === venueTitle) continue;
      mismatched.push({ venueId, listing, venueTitle, tmdbTitle, movie });
    }
  }

  const pairs = [
    ...groupBy(
      mismatched,
      (entry) => `${entry.venueTitle}\u0000${entry.listing.themoviedb.id}`,
    ).values(),
  ]
    .map((group) => {
      const { venueTitle, tmdbTitle, listing, movie } = group[0];
      const venueIds = [...new Set(group.map((entry) => entry.venueId))];
      return {
        key: `${venueTitle}-${listing.themoviedb.id}`,
        venueTitle,
        tmdbTitle,
        kind: kindOf(venueTitle, tmdbTitle),
        tmdb: { id: listing.themoviedb.id, title: listing.themoviedb.title },
        listings: group.length,
        // The titles as the venues wrote them - what a normaliser rule has to
        // turn into the TMDB side.
        examples: [...new Set(group.map((entry) => entry.listing.title))].slice(0, 4),
        venues: venueIds.map((id) => ({ id, name: venues[id]?.name ?? id })),
        url: movie ? movieUrl(movie) : null,
      };
    })
    .sort((a, b) => b.listings - a.listings || a.venueTitle.localeCompare(b.venueTitle));

  return {
    source,
    checked,
    mismatched: mismatched.length,
    pairs,
  };
}
