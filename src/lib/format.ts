// Formatting shared across the pages. Every figure the site prints goes
// through one of these, so a duration or a percentage reads the same way
// wherever it appears.

// Durations are reported in whatever unit keeps the number legible: a 92 minute
// retrieve reads better as "1h 32m" than "92m", and a two minute diff reads
// better as "2m 6s" than "0h 2m".
export function duration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

// Compact form for axis ticks, where the seconds never fit.
export function shortDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  const minutes = ms / 60000;
  if (minutes < 1) return `${Math.round(ms / 1000)}s`;
  if (minutes < 60) return `${Math.round(minutes)}m`;
  return `${(minutes / 60).toFixed(1)}h`;
}

export function percent(value: number | null | undefined, places = 0): string {
  if (value === null || value === undefined) return "—";
  return `${(value * 100).toFixed(places)}%`;
}

// Costs run from fractions of a cent to tens of dollars, and rounding the
// small ones to two places prints "$0.00" for a real charge.
export function money(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (value === 0) return "$0";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  if (value < 1) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(2)}`;
}

export function count(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString("en-GB");
}

export function compactCount(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

// Everything the pipeline does is on London time, and a date rendered in the
// viewer's zone would disagree with the release tags it came from.
const LONDON = "Europe/London";

export function dateLabel(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: LONDON,
    day: "numeric",
    month: "short",
  }).format(new Date(value));
}

export function dateTimeLabel(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: LONDON,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

// "3 hours ago". Rendered at build time, so it describes the moment the site
// was built - the pages that use it say so alongside.
export function relativeTime(value: string | number | null | undefined, from = Date.now()): string {
  if (value === null || value === undefined) return "—";
  const deltaMs = from - new Date(value).getTime();
  const minutes = Math.round(deltaMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

// A signed change, for the week-on-week figures. `null` means there was not
// enough history to compare, which must not render as "0%".
export function signedPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  // Rounded first, so a change of -0.1% prints "0%" rather than "-0%" - a
  // minus sign in front of a zero reads as a fall that did not happen.
  const rounded = Math.round(value * 100);
  if (rounded === 0) return "0%";
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}
