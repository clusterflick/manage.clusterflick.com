import type { CSSProperties } from "react";

// Anchors a tooltip at `fraction` of the chart's width and shifts it back by
// the same fraction of its own: centred mid-chart, hanging right off a point at
// the left edge and left off one at the right. It stays inside the chart at
// every point without measuring anything, where centring it on the point let
// it spill past the edge and get clipped by the panel.
export function tooltipPosition(fraction: number): CSSProperties {
  const percent = Math.min(Math.max(fraction, 0), 1) * 100;
  return { left: `${percent}%`, transform: `translateX(-${percent}%)` };
}
