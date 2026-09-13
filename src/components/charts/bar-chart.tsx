"use client";

import { useMemo, useState } from "react";
import { makeScale, niceDomain, ticksFor } from "./scale";
import { tickFormatter, VALUE_FORMAT, type FormatKey } from "./formatters";
import styles from "./chart.module.scss";
import barStyles from "./bar-chart.module.scss";

export type Bar = {
  label: string;
  value: number;
  // Fixed slot per entity. Omitted means every bar shares slot 1, which is
  // right whenever the bars are one measure across categories rather than
  // several different things.
  slot?: number;
  detail?: string;
};

type Props = {
  bars: Bar[];
  height?: number;
  format: FormatKey;
};

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

export default function BarChart({ bars, height = 220, format }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 720;

  const { scale, ticks, barWidth } = useMemo(() => {
    const domain = niceDomain(bars.map((bar) => bar.value));
    const built = makeScale(width, height, bars.length, domain);
    // A 2px gap of surface between neighbours, so adjacent fills never touch.
    const slotWidth = built.inner.width / Math.max(bars.length, 1);
    return {
      scale: built,
      ticks: ticksFor(domain),
      barWidth: Math.max(slotWidth - 2, 2),
    };
  }, [bars, height]);

  const baseline = scale.y(Math.max(scale.domainY[0], 0));
  const formatValue = VALUE_FORMAT[format];
  const tickLabel = tickFormatter(format, ticks);
  const showLabel = labelledIndices(bars.length, 8);

  return (
    <div className={styles.wrap}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className={styles.svg}
        style={{ aspectRatio: `${width} / ${height}` }}
        role="img"
        aria-label={`${bars.length} bars`}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={46}
              x2={width - 14}
              y1={scale.y(tick)}
              y2={scale.y(tick)}
              stroke="var(--grid)"
              strokeWidth={1}
            />
            <text
              x={40}
              y={scale.y(tick)}
              textAnchor="end"
              dominantBaseline="middle"
              className={styles.axisText}
            >
              {tickLabel(tick)}
            </text>
          </g>
        ))}

        {bars.map((bar, index) => {
          const top = scale.y(bar.value);
          const barHeight = Math.max(Math.abs(baseline - top), 1);
          const x = scale.x(index) - barWidth / 2;
          return (
            <g key={`${bar.label}-${index}`}>
              <rect
                x={x}
                y={Math.min(top, baseline)}
                width={barWidth}
                height={barHeight}
                // Rounded at the data end only, anchored to the baseline.
                rx={Math.min(4, barWidth / 2)}
                fill={`var(--series-${bar.slot ?? 1})`}
                opacity={hover === null || hover === index ? 1 : 0.45}
              />
              {/* A full-height hit target, so a 3px bar is still hoverable. */}
              <rect
                x={scale.x(index) - (barWidth + 2) / 2}
                y={12}
                width={barWidth + 2}
                height={height - 38}
                fill="transparent"
                onPointerEnter={() => setHover(index)}
              />
            </g>
          );
        })}

        {bars.map((bar, index) =>
          showLabel.has(index) ? (
            <text
              key={`label-${index}`}
              x={scale.x(index)}
              y={height - 8}
              textAnchor="middle"
              className={styles.axisText}
            >
              {bar.label}
            </text>
          ) : null,
        )}
      </svg>

      {hover !== null && (
        <div
          className={styles.tooltip}
          style={{ left: `${(scale.x(hover) / width) * 100}%` }}
          role="status"
        >
          <div className={styles.tooltipTitle}>{bars[hover].label}</div>
          <div className={styles.tooltipRow}>
            <span
              className={styles.swatch}
              style={{ background: `var(--series-${bars[hover].slot ?? 1})` }}
              aria-hidden="true"
            />
            <span className={`${styles.tooltipValue} numeric`}>
              {formatValue(bars[hover].value)}
            </span>
          </div>
          {bars[hover].detail && (
            <div className={barStyles.detail}>{bars[hover].detail}</div>
          )}
        </div>
      )}
    </div>
  );
}
