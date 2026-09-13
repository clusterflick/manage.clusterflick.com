// Small numeric helpers shared by the report builders.

export const sum = (values) => values.reduce((total, value) => total + value, 0);

export const mean = (values) => (values.length ? sum(values) / values.length : 0);

// Nearest-rank, so every value returned is one that actually occurred. An
// interpolated p90 over a dozen runs would invent a duration no run took.
export function percentile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil(fraction * sorted.length);
  return sorted[Math.min(Math.max(rank, 1), sorted.length) - 1];
}

export const median = (values) => percentile(values, 0.5);

export const round = (value, places = 4) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

export const rate = (part, whole) => (whole > 0 ? part / whole : 0);

// Groups into a Map, preserving first-seen order so callers can sort later on
// whichever field they mean rather than inheriting an arbitrary one.
export function groupBy(items, keyOf) {
  const groups = new Map();
  for (const item of items) {
    const key = keyOf(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}

// The London day a UTC instant belongs to. Every date in the pipeline is a
// London day - releases are tagged by it and the health log groups by it - so
// deriving one from a timestamp has to agree, BST included.
export const londonDay = (value) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));

// Trend of the last `window` values against the `window` before them, as a
// signed fraction. `null` when there isn't enough history to compare, which
// reads differently from "no change" and should be shown differently.
export function trend(values, window) {
  if (values.length < window * 2) return null;
  const recent = mean(values.slice(-window));
  const previous = mean(values.slice(-window * 2, -window));
  if (previous === 0) return null;
  return round((recent - previous) / previous, 4);
}
