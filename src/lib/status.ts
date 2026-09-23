// The status vocabulary, shared by the tiles, the pills and the charts.
//
// Four states, taken from the data-viz status palette. They are deliberately
// distinct from the categorical series colours so a status can never be read
// as a series - and every one of them ships with a label, because three of the
// four fall below 3:1 on one surface or the other and colour alone would not
// carry it.

export type Severity = "good" | "warning" | "serious" | "critical";

export const SEVERITY_LABEL: Record<Severity, string> = {
  good: "OK",
  warning: "Watch",
  serious: "Degraded",
  critical: "Problem",
};

// Paired with the colour everywhere it is shown, so the meaning survives
// greyscale, colour-blindness and forced-colours mode.
export const SEVERITY_ICON: Record<Severity, string> = {
  good: "●",
  warning: "▲",
  serious: "◆",
  critical: "■",
};

// Bands for a "higher is better" rate. Matches the thresholds the badge
// generator in data-analysed uses, so the site and the badges cannot disagree.
export function rateStatus(value: number | null | undefined): Severity {
  if (value === null || value === undefined) return "warning";
  if (value >= 0.9) return "good";
  if (value >= 0.75) return "warning";
  return "critical";
}

// Bands for the LLM cache hit rate. Deliberately looser than `rateStatus`: a
// workflow succeeding 80% of the time is in trouble, while a transform run
// caching 80% of its calls is doing well.
export function cacheStatus(value: number | null | undefined): Severity {
  if (value === null || value === undefined) return "warning";
  if (value >= 0.75) return "good";
  if (value >= 0.5) return "warning";
  return "critical";
}

// Bands for a "lower is better" rate, such as a probe failure rate.
export function failureStatus(value: number | null | undefined): Severity {
  if (value === null || value === undefined) return "warning";
  if (value <= 0.02) return "good";
  if (value <= 0.1) return "warning";
  if (value <= 0.25) return "serious";
  return "critical";
}
