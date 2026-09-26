"use client";

import { useMemo, useState } from "react";
import { niceStep } from "./scale";
import { tickFormatter, VALUE_FORMAT, type FormatKey } from "./formatters";
import styles from "./chart.module.scss";
import { tooltipPosition } from "./tooltip-position";

export type StackSeries = {
  key: string;
  label: string;
  slot: number;
  values: number[];
};

// A second measure drawn as a line over the bars, on its own axis at the
// right. For the context that says how to read a bar's height - how many runs
// a day's spend was spread over - rather than another part of the stack.
export type StackOverlay = {
  label: string;
  values: number[];
  format: FormatKey;
};

// A dated change drawn as a dashed vertical line on the boundary before the bar
// at `index` - the first day the change applied - so a shift in the bars can
// be read against what caused it.
export type StackMarker = {
  index: number;
  label: string;
};

type Props = {
  series: StackSeries[];
  labels: string[];
  height?: number;
  format: FormatKey;
  overlay?: StackOverlay;
  markers?: StackMarker[];
};

// A stacked bar per label. Only ever used where the parts genuinely sum to a
// meaningful whole - here, per-call-site cost summing to the day's spend.
// Labelled indices are counted back from the last point, so the final label is
// always drawn and is a full step away from its neighbour. Stepping forward
// from zero and then forcing the last one in collides whenever the count is
// not a multiple of the step - which is most of the time.
function labelledIndices(length: number, maximum = 6): Set<number> {
  const step = Math.max(1, Math.ceil(length / maximum));
  const indices = new Set<number>();
  for (let index = length - 1; index >= 0; index -= step) indices.add(index);
  return indices;
}

export default function StackedBars({
  series,
  labels,
  height = 240,
  format,
  overlay,
  markers = [],
}: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 720;
  const padding = { top: 12, right: overlay ? 40 : 14, bottom: 26, left: 52 };

  const { totals, max, barWidth, innerWidth, innerHeight } = useMemo(() => {
    const sums = labels.map((_, index) =>
      series.reduce((total, entry) => total + (entry.values[index] ?? 0), 0),
    );
    const plotWidth = width - padding.left - padding.right;
    const slotWidth = plotWidth / Math.max(labels.length, 1);
    return {
      totals: sums,
      max: Math.max(...sums, 0) || 1,
      barWidth: Math.max(slotWidth - 3, 2),
      innerWidth: plotWidth,
      innerHeight: height - padding.top - padding.bottom,
    };
  }, [series, labels, height, padding.left, padding.right, padding.top, padding.bottom]);

  // Nice steps rather than quarters of the maximum, so the axis reads $0.20,
  // $0.40 … instead of $0.23, $0.45 …. The domain is raised to the top tick so
  // the highest gridline sits at the top of the plot rather than above it.
  const { ticks, domainMax } = (() => {
    const step = niceStep(max / 4);
    const top = Math.ceil(max / step) * step;
    const result: number[] = [];
    for (let value = 0; value <= top + step * 0.001; value += step) {
      result.push(Math.round(value / step) * step);
    }
    return { ticks: result, domainMax: top || 1 };
  })();

  const slotWidth = innerWidth / Math.max(labels.length, 1);
  const xOf = (index: number) => padding.left + (index + 0.5) * slotWidth;
  const hOf = (value: number) => (value / domainMax) * innerHeight;
  const baseline = padding.top + innerHeight;
  const formatValue = VALUE_FORMAT[format];
  const tickLabel = tickFormatter(format, ticks);
  const showLabel = labelledIndices(labels.length, 8);

  // The overlay's axis shares the gridlines already drawn for the bars, so a
  // right-hand label sits on a line rather than floating between two. Its step
  // is the smallest nice value that fits the overlay's maximum into the same
  // number of intervals.
  const overlayAxis = (() => {
    if (!overlay) return null;
    const intervals = Math.max(ticks.length - 1, 1);
    const overlayMax = Math.max(...overlay.values, 0);
    // A count can't step by half a run, so its step is at least one.
    const whole = overlay.format === "count" || overlay.format === "compact";
    const rough = niceStep(overlayMax / intervals);
    const step = whole ? Math.max(1, Math.ceil(rough)) : rough;
    const domain = Math.max(step * intervals, 1);
    const yOf = (value: number) => baseline - (value / domain) * innerHeight;
    const values = ticks.map((_, index) => step * index);
    return {
      yOf,
      values,
      label: tickFormatter(overlay.format, values),
      path: overlay.values
        .map((value, index) => `${index === 0 ? "M" : "L"}${xOf(index)},${yOf(value)}`)
        .join(" "),
    };
  })();

  // Each marker's line starts at its own label, capped with a dot, so a label
  // belongs to the line it touches. Labels are staggered a row apart, and the
  // rows are handed out so a label only ever runs across lines that start
  // below it: past the middle labels read leftwards (clear of the right-hand
  // axis) and the rightmost takes the top row; before it they read rightwards
  // and the leftmost does.
  const placedMarkers = (() => {
    const placed = markers.map((marker) => {
      const x = padding.left + marker.index * slotWidth;
      return { marker, x, leftwards: x > padding.left + innerWidth / 2 };
    });
    const ordered = [
      ...placed.filter((entry) => entry.leftwards).sort((a, b) => b.x - a.x),
      ...placed.filter((entry) => !entry.leftwards).sort((a, b) => a.x - b.x),
    ];
    return ordered.map((entry, row) => ({ ...entry, y: padding.top + 4 + row * 14 }));
  })();

  return (
    <div className={styles.wrap}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className={styles.svg}
        style={{ aspectRatio: `${width} / ${height}` }}
        role="img"
        aria-label={`${series.map((entry) => entry.label).join(", ")} stacked across ${labels.length} days`}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={baseline - hOf(tick)}
              y2={baseline - hOf(tick)}
              stroke="var(--grid)"
              strokeWidth={1}
            />
            <text
              x={padding.left - 6}
              y={baseline - hOf(tick)}
              textAnchor="end"
              dominantBaseline="middle"
              className={styles.axisText}
            >
              {tickLabel(tick)}
            </text>
          </g>
        ))}

        {labels.map((label, index) => {
          let cursor = 0;
          return (
            <g key={`${label}-${index}`}>
              {series.map((entry) => {
                const value = entry.values[index] ?? 0;
                if (value <= 0) return null;
                const segmentHeight = hOf(value);
                const y = baseline - hOf(cursor) - segmentHeight;
                cursor += value;
                return (
                  <rect
                    key={entry.key}
                    x={xOf(index) - barWidth / 2}
                    y={y}
                    width={barWidth}
                    // A 2px gap of surface between segments, so neighbouring
                    // fills read as separate bands rather than one blur.
                    height={Math.max(segmentHeight - 2, 1)}
                    fill={`var(--series-${entry.slot})`}
                    opacity={hover === null || hover === index ? 1 : 0.4}
                  />
                );
              })}
              <rect
                x={xOf(index) - (barWidth + 3) / 2}
                y={padding.top}
                width={barWidth + 3}
                height={innerHeight}
                fill="transparent"
                onPointerEnter={() => setHover(index)}
              />
            </g>
          );
        })}

        {placedMarkers.map(({ marker, x, y, leftwards }) => (
          <g key={`marker-${marker.index}-${marker.label}`} pointerEvents="none">
            <line
              x1={x}
              x2={x}
              y1={y}
              y2={baseline}
              stroke="var(--axis)"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
            <circle cx={x} cy={y} r={2.5} fill="var(--text-secondary)" />
            <text
              x={leftwards ? x - 6 : x + 6}
              y={y}
              textAnchor={leftwards ? "end" : "start"}
              dominantBaseline="middle"
              className={styles.markerText}
            >
              {marker.label}
            </text>
          </g>
        ))}

        {overlay && overlayAxis && (
          <g pointerEvents="none">
            {overlayAxis.values.map((value) => (
              <text
                key={`overlay-tick-${value}`}
                x={width - padding.right + 6}
                y={overlayAxis.yOf(value)}
                textAnchor="start"
                dominantBaseline="middle"
                className={styles.axisText}
              >
                {overlayAxis.label(value)}
              </text>
            ))}
            <path
              d={overlayAxis.path}
              fill="none"
              stroke="var(--text-primary)"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {overlay.values.map((value, index) => (
              <circle
                key={`overlay-point-${index}`}
                cx={xOf(index)}
                cy={overlayAxis.yOf(value)}
                r={hover === index ? 4 : 2.5}
                fill="var(--text-primary)"
                stroke="var(--surface-1)"
                strokeWidth={1.5}
              />
            ))}
          </g>
        )}

        {labels.map((label, index) =>
          showLabel.has(index) ? (
            <text
              key={`label-${index}`}
              x={xOf(index)}
              y={height - 8}
              textAnchor="middle"
              className={styles.axisText}
            >
              {label}
            </text>
          ) : null,
        )}
      </svg>

      {hover !== null && (
        <div
          className={styles.tooltip}
          style={tooltipPosition(xOf(hover) / width)}
          role="status"
        >
          <div className={styles.tooltipTitle}>{labels[hover]}</div>
          {markers
            .filter((marker) => marker.index === hover)
            .map((marker) => (
              <div key={marker.label} className={styles.tooltipNote}>
                {marker.label}
              </div>
            ))}
          {series
            .map((entry) => ({ entry, value: entry.values[hover] ?? 0 }))
            .filter(({ value }) => value > 0)
            .sort((a, b) => b.value - a.value)
            .map(({ entry, value }) => (
              <div key={entry.key} className={styles.tooltipRow}>
                <span
                  className={styles.swatch}
                  style={{ background: `var(--series-${entry.slot})` }}
                  aria-hidden="true"
                />
                <span className={styles.tooltipLabel}>{entry.label}</span>
                <span className={`${styles.tooltipValue} numeric`}>
                  {formatValue(value)}
                </span>
              </div>
            ))}
          <div className={styles.tooltipRow}>
            <span className={styles.swatch} style={{ opacity: 0 }} aria-hidden="true" />
            <span className={styles.tooltipLabel}>Total</span>
            <span className={`${styles.tooltipValue} numeric`}>
              {formatValue(totals[hover])}
            </span>
          </div>
          {overlay && (
            <div className={styles.tooltipRow}>
              <span
                className={styles.swatch}
                style={{ background: "var(--text-primary)", borderRadius: "50%" }}
                aria-hidden="true"
              />
              <span className={styles.tooltipLabel}>{overlay.label}</span>
              <span className={`${styles.tooltipValue} numeric`}>
                {VALUE_FORMAT[overlay.format](overlay.values[hover] ?? 0)}
              </span>
            </div>
          )}
        </div>
      )}

      <ul className={styles.legend}>
        {series.map((entry) => (
          <li key={entry.key} className={styles.legendItem}>
            <span
              className={styles.swatch}
              style={{ background: `var(--series-${entry.slot})` }}
              aria-hidden="true"
            />
            {entry.label}
          </li>
        ))}
        {overlay && (
          <li className={styles.legendItem}>
            <span
              className={styles.swatch}
              style={{ background: "var(--text-primary)", borderRadius: "50%" }}
              aria-hidden="true"
            />
            {overlay.label} (line, right axis)
          </li>
        )}
      </ul>
    </div>
  );
}
