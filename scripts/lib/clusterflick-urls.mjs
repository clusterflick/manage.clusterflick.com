// Links into clusterflick.com, built the way the site builds its own routes
// (src/utils/get-movie-url.ts and get-venue-url.ts there), so a listing here
// opens the page a visitor would see, showings and all.
//
// Every movie in the combined data gets a page, matched or not, so an
// unmatched listing links just as well as a matched one.

import slugify from "@sindresorhus/slugify";

const SITE = "https://clusterflick.com";

export const movieUrl = (movie) => `${SITE}/movies/${movie.id}/${slugify(movie.title)}`;

export const venueUrl = (venue) => `${SITE}/venues/${slugify(venue.name)}`;
