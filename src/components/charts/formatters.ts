// Charts take the *name* of a formatter rather than the function itself.
//
// A server component cannot hand a function to a client component, and every
// page here is prerendered. Passing a key keeps the formatting decision on the
// page - where the meaning of the number lives - while the function itself
// resolves inside the client boundary.
//
// Tick labels are formatted against the axis as a whole, not each value on its
// own. Two things go wrong otherwise, and both did:
//
//   - Precision. A failure-rate axis running 0 to 1% has ticks at 0.25%
//     intervals, and rounding each to whole percent printed "0%, 0%, 0%, 1%,
//     1%" - five labels, two distinct readings, no way to read the chart.
//     Decimals come from the tick step instead.
//
//   - Unit. A duration axis stepping every 33 minutes printed "33m, 1.1h,
//     1.7h, 2.2h", changing unit halfway up its own axis. The unit is chosen
//     once from the largest tick and held for all of them.

import { compactCount, count, money, percent } from "@/lib/format";

export type FormatKey = "money" | "percent" | "count" | "duration" | "compact";

// How many decimals a step needs before consecutive ticks stop colliding.
function decimalsFor(step: number, scale = 1): number {
  const scaled = Math.abs(step) * scale;
  if (!Number.isFinite(scaled) || scaled === 0) return 0;
  return Math.min(Math.max(Math.ceil(-Math.log10(scaled)), 0), 4);
}

// The precise reading, for a tooltip - where there is room to be exact.
export const VALUE_FORMAT: Record<FormatKey, (value: number) => string> = {
  money: (value) => money(value),
  percent: (value) => percent(value, 2),
  count: (value) => count(Math.round(value)),
  duration: (value) => exactDuration(value),
  compact: (value) => compactCount(Math.round(value)),
};

function exactDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

// The axis label, formatted against the whole axis.
export function tickFormatter(
  key: FormatKey,
  ticks: number[],
): (value: number) => string {
  const max = Math.max(...ticks.map(Math.abs), 0);
  const step =
    ticks.length > 1 ? Math.abs(ticks[1] - ticks[0]) : max || 1;

  switch (key) {
    case "percent": {
      const places = decimalsFor(step, 100);
      return (value) => `${(value * 100).toFixed(places)}%`;
    }
    case "money": {
      const places = Math.max(decimalsFor(step), 2);
      return (value) => (value === 0 ? "$0" : `$${value.toFixed(places)}`);
    }
    case "duration": {
      // One unit for the axis, chosen from its top: seconds under two
      // minutes, minutes under two hours, hours above.
      if (max < 120_000) return (value) => `${Math.round(value / 1000)}s`;
      if (max < 7_200_000) {
        const places = step < 60_000 ? 1 : 0;
        return (value) => `${(value / 60_000).toFixed(places)}m`;
      }
      const places = step < 1_800_000 ? 1 : 0;
      return (value) => `${(value / 3_600_000).toFixed(places)}h`;
    }
    case "count":
    case "compact":
    default:
      return (value) =>
        step >= 1 ? compactCount(Math.round(value)) : String(value);
  }
}
