// What the catalogue currently looks like: what matched, what didn't, and what
// is missing from the things that did.
//
// Two distinctions run through this file, and the match rate is wrong without
// either of them.
//
// First, a movie that failed to match is not the same as a listing that was
// never a film. 454 of 1,840 entries carry `isUnmatched`, which sounds alarming
// until you notice most are shorts programmes, Q&As, quiz nights and gigs -
// listings with no film to match to and never will have. So everything below
// splits on the categories a movie's showings carry, and the headline rate is
// over film listings only.
//
// Second, `isUnmatched` is not the same as unmatched. A double bill has no
// single film to resolve to, so the wrapper entry carries `isUnmatched: true`
// while the match lives in `includedMovies` - a list of fully resolved films,
// each with its own TMDB id, imdbId, poster and metadata. 47 of the 50
// multi-film listings are resolved this way. Reading the flag alone counts
// every one of them as a failure and puts the match rate at 91.7% when it is
// 94.8%.
//
// So: a listing is matched when it either matched outright or resolved into
// parts. The three multi-film listings that genuinely have no `includedMovies`
// are all "Mystery Movie" screenings, where the film is secret by design.

import { groupBy, rate, round } from "./stats.mjs";

// Categories that name an actual feature film, and so ought to match. Anything
// else is a listing the matcher is right to leave alone.
const FILM_CATEGORIES = new Set(["movie", "multiple-movies"]);

// Fields a matched movie is expected to carry. A matched movie missing one of
// these is a partial match - the title resolved but the metadata behind it is
// thin - and that is a different job from an unmatched title.
const EXPECTED_FIELDS = [
  { key: "posterPath", label: "Poster" },
  { key: "overview", label: "Overview" },
  { key: "year", label: "Year" },
  { key: "imdbId", label: "IMDb ID" },
  { key: "duration", label: "Duration" },
  { key: "classification", label: "Classification" },
  { key: "youtubeTrailer", label: "Trailer" },
  { key: "directors", label: "Directors" },
  { key: "genres", label: "Genres" },
];

const RATING_PROVIDERS = [
  { key: "imdb", label: "IMDb" },
  { key: "letterboxd", label: "Letterboxd" },
  { key: "metacritic", label: "Metacritic" },
  { key: "rottentomatoes", label: "Rotten Tomatoes" },
  { key: "moviedb", label: "TMDB" },
  { key: "bechdel", label: "Bechdel" },
];

// A wrapper that resolved into its constituent films. The parts are complete
// movie objects, not ids - `includedMovies[n].posterPath` and the rest are all
// present - so nothing further needs looking up to know the match succeeded.
const resolvedIntoParts = (movie) => (movie.includedMovies?.length ?? 0) > 0;

// The question every count here is really asking: did this listing come out of
// the matcher with films attached, one way or the other.
const isMatched = (movie) => !movie.isUnmatched || resolvedIntoParts(movie);

const isEmpty = (value) =>
  value === undefined ||
  value === null ||
  value === "" ||
  (Array.isArray(value) && value.length === 0);

// A movie's categories come from its showings, which can disagree - the same
// title booked as a plain screening at one venue and a Q&A at another.
function categoriesOf(movie) {
  return new Set(Object.values(movie.showings).map((showing) => showing.category));
}

const isFilmListing = (movie) =>
  [...categoriesOf(movie)].some((category) => FILM_CATEGORIES.has(category));

function venuesOf(movie, venues) {
  const ids = new Set(
    Object.values(movie.showings).map((showing) => showing.venueId),
  );
  return [...ids].map((id) => ({
    id,
    name: venues[id]?.name ?? id,
  }));
}

// The soonest performance still ahead of us. An unmatched title with nothing
// upcoming is history; one screening on Friday is worth fixing now.
function nextPerformance(movie, now) {
  const times = movie.performances
    .map((performance) => performance.time)
    .filter((time) => time >= now);
  return times.length ? Math.min(...times) : null;
}

function summariseMovie(movie, venues, now) {
  const showings = Object.values(movie.showings);
  return {
    id: movie.id,
    title: movie.title,
    year: movie.year ?? null,
    categories: [...categoriesOf(movie)].sort(),
    venues: venuesOf(movie, venues),
    showings: showings.length,
    performances: movie.performances.length,
    nextPerformance: nextPerformance(movie, now),
    // One example link is enough to go and look at the listing; the rest are a
    // click away in the venue's own programme.
    url: showings[0]?.url ?? null,
  };
}

export default function buildCatalogueReport(combined, matched, releaseInfo) {
  const now = Date.now();
  const movies = Object.values(combined.movies);
  const venues = combined.venues;

  const films = movies.filter(isFilmListing);
  const nonFilms = movies.filter((movie) => !isFilmListing(movie));
  const unmatchedFilms = films.filter((movie) => !isMatched(movie));
  const unmatchedNonFilms = nonFilms.filter((movie) => !isMatched(movie));
  // Wrappers that resolved into parts, reported in their own right: they are
  // matched, but they carry none of the fields a single matched film does, so
  // folding them into the coverage figures below would read as missing data.
  const resolvedFilms = films.filter(resolvedIntoParts);
  const resolvedNonFilms = nonFilms.filter(resolvedIntoParts);
  // Coverage is asked only of entries that resolved to one film of their own.
  const matchedMovies = movies.filter((movie) => !movie.isUnmatched);

  // Coverage of the expected fields, over matched movies only. Asking an
  // unmatched title for its poster is asking the wrong question - it has no
  // match to have got one from.
  const fieldCoverage = EXPECTED_FIELDS.map(({ key, label }) => {
    const missing = matchedMovies.filter((movie) => isEmpty(movie[key]));
    return {
      key,
      label,
      present: matchedMovies.length - missing.length,
      total: matchedMovies.length,
      coverage: round(rate(matchedMovies.length - missing.length, matchedMovies.length)),
      // Capped: the list is for working through, and a page that renders two
      // thousand rows is one nobody scrolls. The count above is the real figure.
      examples: missing
        .slice()
        .sort((a, b) => b.performances.length - a.performances.length)
        .slice(0, 60)
        .map((movie) => summariseMovie(movie, venues, now)),
    };
  });

  const ratingCoverage = RATING_PROVIDERS.map(({ key, label }) => {
    const provider = matched[key] ?? {};
    const present = matchedMovies.filter((movie) => provider[movie.id]).length;
    return {
      key,
      label,
      present,
      total: matchedMovies.length,
      coverage: round(rate(present, matchedMovies.length)),
    };
  });

  // Per-venue miss rate over film listings only, so a music venue that only
  // ever lists gigs doesn't appear as 100% broken.
  const filmShowings = [];
  for (const movie of movies) {
    for (const showing of Object.values(movie.showings)) {
      if (!FILM_CATEGORIES.has(showing.category)) continue;
      filmShowings.push({
        venueId: showing.venueId,
        unmatched: !isMatched(movie),
      });
    }
  }
  const byVenue = [...groupBy(filmShowings, (showing) => showing.venueId)]
    .map(([venueId, showings]) => {
      const missed = showings.filter((showing) => showing.unmatched).length;
      return {
        id: venueId,
        name: venues[venueId]?.name ?? venueId,
        type: venues[venueId]?.type ?? null,
        filmShowings: showings.length,
        unmatched: missed,
        missRate: round(rate(missed, showings.length)),
      };
    })
    // Worst first, but a single miss out of one showing is 100% and tells you
    // nothing - order by how many listings are actually going unmatched.
    .sort((a, b) => b.unmatched - a.unmatched || b.missRate - a.missRate);

  // Venues carrying nothing at all - but split by what the venue is for,
  // because "no listings" means opposite things either side of that line.
  //
  // Of 414 venues, 268 are `programming: "host"`: community centres, pubs,
  // parks, churches - spaces that host an occasional film night rather than
  // running a programme. Almost all of them are empty almost all of the time,
  // and that is the normal state, not a fault. A venue whose `programming` is
  // `cinema` carrying nothing is the opposite: a cinema is always showing
  // something, so an empty one means its retrieval has stopped producing.
  //
  // Reported apart so the count that matters isn't buried under the count that
  // doesn't - the same reason the match rate above counts film listings only.
  const venuesWithShowings = new Set(
    movies.flatMap((movie) =>
      Object.values(movie.showings).map((showing) => showing.venueId),
    ),
  );
  const allSilent = Object.values(venues)
    .filter((venue) => !venuesWithShowings.has(venue.id))
    .map((venue) => ({
      id: venue.id,
      name: venue.name,
      type: venue.type ?? null,
      programming: venue.programming ?? null,
      url: venue.url ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const silentVenues = {
    // A cinema with nothing on. This is the number worth an alert.
    cinemas: allSilent.filter((venue) => venue.programming === "cinema"),
    // Programmes films alongside other things; an empty one is worth a look
    // but is not necessarily broken.
    venues: allSilent.filter((venue) => venue.programming === "venue"),
    // Hosts the occasional screening. Empty is the normal state.
    hosts: allSilent.filter((venue) => venue.programming === "host"),
    unknown: allSilent.filter(
      (venue) => !["cinema", "venue", "host"].includes(venue.programming),
    ),
    total: allSilent.length,
  };

  const performanceCount = movies.reduce(
    (total, movie) => total + movie.performances.length,
    0,
  );
  const upcomingPerformances = movies.reduce(
    (total, movie) =>
      total + movie.performances.filter((performance) => performance.time >= now).length,
    0,
  );

  const byCategory = [...groupBy(movies, (movie) => [...categoriesOf(movie)].sort().join(", "))]
    .map(([categories, group]) => ({
      categories,
      total: group.length,
      unmatched: group.filter((movie) => !isMatched(movie)).length,
      resolved: group.filter(resolvedIntoParts).length,
    }))
    .sort((a, b) => b.total - a.total);

  return {
    release: releaseInfo,
    generatedAt: combined.generatedAt,
    totals: {
      movies: movies.length,
      venues: Object.keys(venues).length,
      people: Object.keys(combined.people).length,
      performances: performanceCount,
      upcomingPerformances,
      filmListings: films.length,
      nonFilmListings: nonFilms.length,
    },
    matching: {
      matched: matchedMovies.length,
      unmatchedFilms: unmatchedFilms.length,
      unmatchedNonFilms: unmatchedNonFilms.length,
      resolvedFilms: resolvedFilms.length,
      resolvedNonFilms: resolvedNonFilms.length,
      // The headline: of the listings that should have matched, how many did -
      // counting a double bill that resolved into its parts as a match.
      filmMatchRate: round(rate(films.length - unmatchedFilms.length, films.length)),
    },
    // The multi-film and shorts programmes that resolved into their parts, so
    // the number above can be checked rather than taken on trust.
    resolved: [...resolvedFilms, ...resolvedNonFilms]
      .map((movie) => ({
        ...summariseMovie(movie, venues, now),
        parts: movie.includedMovies.map((part) => ({
          id: part.id,
          title: part.title,
          year: part.year ?? null,
          hasPoster: Boolean(part.posterPath),
        })),
      }))
      .sort((a, b) => b.parts.length - a.parts.length),
    byCategory,
    // Ordered by what is showing soonest - the ones still worth fixing.
    unmatchedFilms: unmatchedFilms
      .map((movie) => summariseMovie(movie, venues, now))
      .sort((a, b) => {
        if (a.nextPerformance === null) return 1;
        if (b.nextPerformance === null) return -1;
        return a.nextPerformance - b.nextPerformance;
      }),
    unmatchedOther: unmatchedNonFilms
      .map((movie) => summariseMovie(movie, venues, now))
      .sort((a, b) => b.performances.length - a.performances.length)
      .slice(0, 200),
    fieldCoverage,
    ratingCoverage,
    byVenue,
    silentVenues,
  };
}
