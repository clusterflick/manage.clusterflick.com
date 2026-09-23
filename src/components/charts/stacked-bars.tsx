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

type Props = {
  series: StackSeries[];
  labels: string[];
  height?: number;
  format: FormatKey;
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
}: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 720;
  const padding = { top: 12, right: 14, bottom: 26, left: 52 };

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

  const xOf = (index: number) =>
    padding.left + (index + 0.5) * (innerWidth / Math.max(labels.length, 1));
  const hOf = (value: number) => (value / domainMax) * innerHeight;
  const baseline = padding.top + innerHeight;
  const formatValue = VALUE_FORMAT[format];
  const tickLabel = tickFormatter(format, ticks);
  const showLabel = labelledIndices(labels.length, 8);

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
      </ul>
    </div>
  );
}
