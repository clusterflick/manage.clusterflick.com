// Which film URLs has each deploy of clusterflick.com turned into a 404, and
// which of them should it have sent somewhere?
//
// Every deploy publishes /movie-urls.json, each film page it built, and the
// movie-redirects Worker reads it to answer a dead film URL with a redirect.
// data-analysed's Film 404 Log compares each deploy's map with the one before
// and runs every URL that stopped being a page through the Worker's own rules
// (`findLostUrls` in @clusterflick/catalogue), one row per deploy. So this
// page reports what the Worker will do with a URL before anyone follows it.
//
// Most of what a deploy leaves behind is fine: an unmatched one-off event that
// has finished, with nothing like it showing, is a 404 because that is the
// honest answer. What's worth a look is what data-analysed marks for review -
// a showing film that left without the departed page it should have, a
// redirect made by title rather than by id (the fuzzy thresholds at work), and
// a slug two showing films share.

const DAY_MS = 86400000;
// The review list and the per-deploy chart cover this many days. Older rows
// stay in the log for anyone who wants them.
const WINDOW_DAYS = 14;
// The latest deploy's full list is shown in a table; a deploy that drops more
// than this is shown in part, with the total beside it.
const LATEST_LIMIT = 500;

// What a lost URL's `kind` means, for the page.
export const KIND_ORDER = ["lost", "retitled", "listing", "pruned", "unknown"];

const sum = (values) => values.reduce((total, value) => total + value, 0);

const addCounts = (into, counts) => {
  for (const [key, value] of Object.entries(counts ?? {})) {
    into[key] = (into[key] ?? 0) + value;
  }
  return into;
};

const isNotFound = (url) => url.outcome === "not-found";

export default function buildMovie404Report(rows) {
  if (!rows.length) return { empty: true };

  const latest = rows[rows.length - 1];
  const latestAt = new Date(latest.deployedAt).getTime();
  const since = latestAt - WINDOW_DAYS * DAY_MS;
  const windowRows = rows.filter(
    (row) => new Date(row.deployedAt).getTime() > since,
  );

  const byKind = {};
  const byOutcome = {};
  for (const row of windowRows) {
    addCounts(byKind, row.byKind);
    addCounts(byOutcome, row.byOutcome);
  }

  // Newest first: what needs looking at is most likely what just happened.
  const review = windowRows
    .flatMap((row) =>
      row.urls
        .filter((url) => url.review)
        .map((url) => ({ ...url, deployedAt: row.deployedAt })),
    )
    .sort(
      (a, b) =>
        // A lost film is a fault, so it leads whatever its date.
        Number(b.kind === "lost") - Number(a.kind === "lost") ||
        b.deployedAt.localeCompare(a.deployedAt),
    );

  return {
    empty: false,
    window: {
      days: WINDOW_DAYS,
      deploys: windowRows.length,
      firstAt: windowRows[0].deployedAt,
      lastAt: latest.deployedAt,
      totalDeploys: rows.length,
    },
    totals: {
      lost: sum(windowRows.map((row) => row.lost)),
      redirected: sum(windowRows.map((row) => row.redirected)),
      notFound: sum(
        windowRows.map((row) => row.urls.filter(isNotFound).length),
      ),
      review: review.length,
      lostFilms: review.filter((url) => url.kind === "lost").length,
    },
    byKind,
    byOutcome: Object.fromEntries(
      Object.entries(byOutcome).sort(([, a], [, b]) => b - a),
    ),
    deploys: windowRows.map((row) => ({
      deployedAt: row.deployedAt,
      pages: row.pages.current,
      lost: row.lost,
      redirected: row.redirected,
      notFound: row.urls.filter(isNotFound).length,
      review: row.review,
    })),
    review,
    latest: {
      deployedAt: latest.deployedAt,
      previousDeployedAt: latest.previousDeployedAt,
      pages: latest.pages,
      lost: latest.lost,
      redirected: latest.redirected,
      review: latest.review,
      shown: Math.min(latest.urls.length, LATEST_LIMIT),
      urls: latest.urls.slice(0, LATEST_LIMIT),
    },
  };
}
