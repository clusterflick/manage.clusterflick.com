// Listings that won't sit still from one combine run to the next.
//
// Every showing carries an id the venue gave it, and that id is stable across
// runs, so the same listing can be followed through a series of data-combined
// releases. Two ways it can misbehave are worth seeing:
//
// - Match flapping: the listing sits under one film, then another, then the
//   first again. A listing that moves once has been rematched - a title
//   corrected, a better match found - and that is fine. Coming back to a film
//   it already had is the matcher unable to make up its mind, and the site
//   shows a different film on alternate days. Moving to and from "unmatched"
//   counts too: a match that only sometimes happens.
// - Presence flapping: the listing is in a release, missing from the next, and
//   back after that, while it still had performances to come. A listing whose
//   last performance has passed drops out on its own, and comes back under the
//   same id when the venue adds a date - the Ritzy's monthly events do exactly
//   this. That is three quarters of the gaps, and none of them are faults, so
//   a gap only counts when the listing still had something ahead of it.
//
// Both are grouped by film rather than listed per showing, because a matcher
// flap usually happens to every venue listing the same title at once - the
// three Curzons below one row, not three.

import { groupBy } from "./stats.mjs";
import { movieUrl } from "./clusterflick-urls.mjs";

// Everything the pages need to know about a film a listing sat under. Linked
// only when it is still in the latest release - an older id's page is gone.
function filmOf(id, history, latestMovies) {
  const movie = [...history].reverse().find((run) => run.movies[id])?.movies[id];
  return {
    id,
    title: movie?.title ?? id,
    matched: movie?.matched ?? false,
    url: latestMovies[id] ? movieUrl(latestMovies[id]) : null,
  };
}

// The film a showing sat under in each run, null where it was not listed.
function timelineOf(showingId, history) {
  return history.map((run) => run.showings[showingId]?.movieId ?? null);
}

// A listing flaps between matches when it moves back to a film it has already
// had. Runs where it was absent are skipped: coming back under the same film
// after a gap is a presence flap, not a match flap.
function matchFlapsOf(timeline, history) {
  let switches = 0;
  let returns = 0;
  let lastReturnAt = null;
  const held = new Set();
  let previous = null;
  timeline.forEach((movieId, index) => {
    if (movieId === null) return;
    if (previous !== null && movieId !== previous) {
      switches += 1;
      if (held.has(movieId)) {
        returns += 1;
        lastReturnAt = history[index].publishedAt;
      }
    }
    held.add(movieId);
    previous = movieId;
  });
  return { switches, returns, lastReturnAt };
}

// A listing flaps in and out when it is missing from a run between two it was
// in, having still had a performance ahead of it when it went. Absence before
// its first run or after its last is not a flap - it had not been listed yet,
// or it has finished - and nor is a gap it left with nothing left to show.
//
// Returns a state per run: "in", "out" for a flap, or null for anything else.
function presenceFlapsOf(showingId, timeline, history) {
  const first = timeline.findIndex((movieId) => movieId !== null);
  const last = timeline.findLastIndex((movieId) => movieId !== null);
  const states = timeline.map((movieId) => (movieId === null ? null : "in"));
  let dropouts = 0;
  let missedRuns = 0;
  let lastReturnAt = null;
  let index = first + 1;
  while (index <= last) {
    if (timeline[index] !== null) {
      index += 1;
      continue;
    }
    const end = timeline.findIndex((movieId, at) => at > index && movieId !== null);
    const lastPerformance = history[index - 1].showings[showingId].lastPerformance;
    const droppedAt = Date.parse(history[index].publishedAt);
    if (lastPerformance !== null && lastPerformance >= droppedAt) {
      dropouts += 1;
      missedRuns += end - index;
      lastReturnAt = history[end].publishedAt;
      for (let at = index; at < end; at += 1) states[at] = "out";
    }
    index = end;
  }
  return { dropouts, missedRuns, lastReturnAt, states, last };
}

const venueOf = (id, venues) => ({ id, name: venues[id]?.name ?? id });

const latest = (values) =>
  values.filter(Boolean).reduce((a, b) => (a > b ? a : b), null);

export default function buildFlappingReport({ history, venues, latestMovies }) {
  const showingIds = new Set(history.flatMap((run) => Object.keys(run.showings)));
  const venueIdOf = (showingId) =>
    history.findLast((run) => run.showings[showingId]).showings[showingId].venueId;

  const matchFlaps = [];
  const presenceFlaps = [];
  for (const showingId of showingIds) {
    const timeline = timelineOf(showingId, history);
    const venue = venueOf(venueIdOf(showingId), venues);

    const match = matchFlapsOf(timeline, history);
    if (match.returns > 0) {
      matchFlaps.push({ id: showingId, venue, timeline, ...match });
    }

    const presence = presenceFlapsOf(showingId, timeline, history);
    if (presence.dropouts > 0) {
      presenceFlaps.push({
        id: showingId,
        venue,
        timeline: presence.states,
        dropouts: presence.dropouts,
        missedRuns: presence.missedRuns,
        lastReturnAt: presence.lastReturnAt,
        movieId: timeline[presence.last],
      });
    }
  }

  // Match flaps grouped by the films involved: the same pair flapping at five
  // venues is one matcher problem. Films are lettered in the order they first
  // appear, and each listing's timeline refers to them by index.
  const matchGroups = [
    ...groupBy(matchFlaps, (flap) =>
      [...new Set(flap.timeline.filter(Boolean))].sort().join("|"),
    ),
  ].map(([key, flaps]) => {
    const order = [];
    for (const flap of flaps) {
      for (const movieId of flap.timeline) {
        if (movieId !== null && !order.includes(movieId)) order.push(movieId);
      }
    }
    const films = order.map((id) => filmOf(id, history, latestMovies));
    const listings = flaps
      .map((flap) => ({
        id: flap.id,
        venue: flap.venue,
        switches: flap.switches,
        lastFlipAt: flap.lastReturnAt,
        timeline: flap.timeline.map((movieId) =>
          movieId === null ? null : order.indexOf(movieId),
        ),
      }))
      .sort((a, b) => b.switches - a.switches || a.venue.name.localeCompare(b.venue.name));
    return {
      key,
      films,
      // Flapping in and out of a match reads differently from flapping between
      // two films - the first is a match that only sometimes happens, the
      // second is the matcher choosing between candidates.
      kind: films.some((film) => !film.matched) ? "sometimes unmatched" : "between films",
      venues: [...new Map(listings.map((l) => [l.venue.id, l.venue])).values()],
      listings,
      switches: Math.max(...listings.map((listing) => listing.switches)),
      lastFlipAt: latest(listings.map((listing) => listing.lastFlipAt)),
    };
  });

  // Presence flaps grouped by the film the listing last sat under.
  const presenceGroups = [...groupBy(presenceFlaps, (flap) => flap.movieId)].map(
    ([movieId, flaps]) => {
      const listings = flaps
        .map(({ id, venue, timeline, dropouts, missedRuns, lastReturnAt }) => ({
          id,
          venue,
          timeline,
          dropouts,
          missedRuns,
          lastReturnAt,
        }))
        .sort((a, b) => b.dropouts - a.dropouts || a.venue.name.localeCompare(b.venue.name));
      return {
        key: movieId,
        film: filmOf(movieId, history, latestMovies),
        venues: [...new Map(listings.map((l) => [l.venue.id, l.venue])).values()],
        listings,
        dropouts: Math.max(...listings.map((listing) => listing.dropouts)),
        lastReturnAt: latest(listings.map((listing) => listing.lastReturnAt)),
      };
    },
  );

  const byRecent = (field) => (a, b) => (b[field] ?? "").localeCompare(a[field] ?? "");

  return {
    releases: history.map(({ tag, publishedAt }) => ({ tag, publishedAt })),
    listingsSeen: showingIds.size,
    match: {
      listings: matchFlaps.length,
      groups: matchGroups.sort(byRecent("lastFlipAt")),
    },
    presence: {
      listings: presenceFlaps.length,
      groups: presenceGroups.sort(byRecent("lastReturnAt")),
    },
  };
}
