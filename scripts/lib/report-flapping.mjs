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
// Match flaps are grouped by film, because a matcher flap usually happens to
// every venue listing the same title at once - three Curzons are one row, not
// three. Presence flaps are grouped by venue, because a drop-out is usually
// the venue's retrieval coming back short.
//
// A listing that has finished - gone from the latest release, or with nothing
// left to show in it - is treated differently by each. Its match flaps are
// dropped: nobody sees it flip any more, and if the matcher is still undecided
// on the title, the listings still showing keep the row. Its presence flaps
// are kept, since the film finishing says nothing about the venue's retrieval
// being fixed, but counted apart from the listings still live.
//
// A match flap that has since settled is dropped too: once a listing has sat
// under the same film for the last SETTLED_RUNS releases, the fix - a title
// corrected, a matcher change - has held long enough to trust. If it flips
// again it comes straight back, with its whole history in the timeline.

import { groupBy } from "./stats.mjs";
import { movieUrl, venueUrl } from "./clusterflick-urls.mjs";

// How many releases a listing has to hold the same film before its match
// flaps stop being shown - about five days of combine runs.
const SETTLED_RUNS = 10;

// Everything the pages need to know about a film a listing sat under. Linked
// only when it is still in the latest release - an older id's page is gone.
function filmOf(id, history, latestMovies) {
  const movie = [...history].reverse().find((run) => run.movies[id])?.movies[
    id
  ];
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
  let lastSwitch = null;
  const held = new Set();
  let previous = null;
  timeline.forEach((movieId, index) => {
    if (movieId === null) return;
    if (previous !== null && movieId !== previous) {
      switches += 1;
      lastSwitch = index;
      if (held.has(movieId)) {
        returns += 1;
        lastReturnAt = history[index].publishedAt;
      }
    }
    held.add(movieId);
    previous = movieId;
  });
  const settled =
    lastSwitch === null || timeline.length - lastSwitch >= SETTLED_RUNS;
  return { switches, returns, lastReturnAt, settled };
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
    const end = timeline.findIndex(
      (movieId, at) => at > index && movieId !== null,
    );
    const lastPerformance =
      history[index - 1].showings[showingId].lastPerformance;
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
  const showingIds = new Set(
    history.flatMap((run) => Object.keys(run.showings)),
  );
  const venueIdOf = (showingId) =>
    history.findLast((run) => run.showings[showingId]).showings[showingId]
      .venueId;

  // Still live: in the latest release, with a performance still ahead of it
  // when that release was published.
  const newest = history.at(-1);
  const newestAt = Date.parse(newest.publishedAt);
  const isLive = (showingId) => {
    const showing = newest.showings[showingId];
    if (!showing) return false;
    return (
      showing.lastPerformance === null || showing.lastPerformance >= newestAt
    );
  };

  const matchFlaps = [];
  let settledMatchFlaps = 0;
  const presenceFlaps = [];
  for (const showingId of showingIds) {
    const timeline = timelineOf(showingId, history);
    const venue = venueOf(venueIdOf(showingId), venues);
    const live = isLive(showingId);

    const { settled, ...match } = matchFlapsOf(timeline, history);
    if (match.returns > 0 && live) {
      if (settled) settledMatchFlaps += 1;
      else matchFlaps.push({ id: showingId, venue, timeline, ...match });
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
        live,
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
      .sort(
        (a, b) =>
          b.switches - a.switches || a.venue.name.localeCompare(b.venue.name),
      );
    return {
      key,
      films,
      // Flapping in and out of a match reads differently from flapping between
      // two films - the first is a match that only sometimes happens, the
      // second is the matcher choosing between candidates.
      kind: films.some((film) => !film.matched)
        ? "sometimes unmatched"
        : "between films",
      venues: [...new Map(listings.map((l) => [l.venue.id, l.venue])).values()],
      listings,
      switches: Math.max(...listings.map((listing) => listing.switches)),
      lastFlipAt: latest(listings.map((listing) => listing.lastFlipAt)),
    };
  });

  // Presence flaps grouped by venue, then film. A drop-out is almost always
  // the venue's own retrieval coming back short - Enfield losing eight
  // listings in one run, a ticketing page answering in a different shape - so
  // the venue is the thing to look at first, and the films say what went
  // missing from it.
  const listingsAt = (venueId) =>
    history.map(
      (run) =>
        Object.values(run.showings).filter(
          (showing) => showing.venueId === venueId,
        ).length,
    );
  const presenceGroups = [
    ...groupBy(presenceFlaps, (flap) => flap.venue.id),
  ].map(([venueId, flaps]) => {
    const listings = flaps
      .map(
        ({
          id,
          timeline,
          dropouts,
          missedRuns,
          lastReturnAt,
          movieId,
          live,
        }) => ({
          id,
          film: filmOf(movieId, history, latestMovies),
          timeline,
          dropouts,
          missedRuns,
          lastReturnAt,
          live,
        }),
      )
      // In the order they went missing, so listings that dropped together
      // sit together.
      .sort(
        (a, b) =>
          a.timeline.indexOf("out") - b.timeline.indexOf("out") ||
          a.film.title.localeCompare(b.film.title),
      );
    return {
      key: venueId,
      venue: {
        ...flaps[0].venue,
        url: venues[venueId] ? venueUrl(venues[venueId]) : null,
      },
      listings,
      // Per run, how many of these listings were missing, against how many
      // the venue carried in all - eight gone from sixty-nine reads very
      // differently from eight gone from eight.
      missing: history.map(
        (_, run) =>
          listings.filter((listing) => listing.timeline[run] === "out").length,
      ),
      venueListings: listingsAt(venueId),
      dropouts: listings.reduce(
        (total, listing) => total + listing.dropouts,
        0,
      ),
      liveListings: listings.filter((listing) => listing.live).length,
      lastReturnAt: latest(listings.map((listing) => listing.lastReturnAt)),
    };
  });

  const byRecent = (field) => (a, b) =>
    (b[field] ?? "").localeCompare(a[field] ?? "");

  return {
    releases: history.map(({ tag, publishedAt }) => ({ tag, publishedAt })),
    listingsSeen: showingIds.size,
    match: {
      listings: matchFlaps.length,
      settled: settledMatchFlaps,
      settledRuns: SETTLED_RUNS,
      groups: matchGroups.sort(byRecent("lastFlipAt")),
    },
    presence: {
      listings: presenceFlaps.length,
      liveListings: presenceFlaps.filter((flap) => flap.live).length,
      groups: presenceGroups.sort(byRecent("lastReturnAt")),
    },
  };
}
