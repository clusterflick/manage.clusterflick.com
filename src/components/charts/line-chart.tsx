"use client";

import { useId, useMemo, useRef, useState } from "react";
import {
  areaPath,
  linePath,
  makeScale,
  niceDomain,
  ticksFor,
  type Point,
} from "./scale";
import { tickFormatter, VALUE_FORMAT, type FormatKey } from "./formatters";
import styles from "./chart.module.scss";
import { tooltipPosition } from "./tooltip-position";

export type Series = {
  key: string;
  label: string;
  values: (number | null)[];
  // Slot 1-8 of the categorical palette. Assigned by entity and held fixed -
  // a filter that changes how many series are shown must not repaint the
  // survivors.
  slot?: number;
  // Draws an area under the line. Only ever used on a single-series chart;
  // stacked areas hide the shape of everything above the bottom band.
  area?: boolean;
};

type Props = {
  series: Series[];
  labels: string[];
  height?: number;
  // Named rather than passed as a function: these charts are client
  // components rendered from prerendered server pages, which cannot hand a
  // function across the boundary.
  format: FormatKey;
  // A reference line - a mean, a budget, a threshold - with its own label.
  reference?: { value: number; label: string };
  yLabel?: string;
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

export default function LineChart({
  series,
  labels,
  height = 220,
  format,
  reference,
  yLabel,
}: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const clipId = useId();

  // A fixed viewBox scaled by CSS: the chart stays crisp at any width without
  // measuring the container, which a static export cannot do before paint.
  const width = 720;

  const { scale, paths, ticks } = useMemo(() => {
    const all = series.flatMap((entry) => entry.values).filter((value): value is number => value !== null);
    const domain = niceDomain(reference ? [...all, reference.value] : all);
    const built = makeScale(width, height, labels.length, domain);
    return {
      scale: built,
      ticks: ticksFor(domain),
      paths: series.map((entry) => {
        const points: Point[] = entry.values.map((value, index) => ({ x: index, y: value }));
        return {
          ...entry,
          line: linePath(points, built),
          area: entry.area ? areaPath(points, built, Math.max(domain[0], 0)) : null,
        };
      }),
    };
  }, [series, labels.length, height, reference]);

  const slotVar = (entry: { slot?: number }) => `var(--series-${entry.slot ?? 1})`;

  // Pointer position maps to the nearest index rather than the nearest mark,
  // so the whole column is a hit target instead of the 8px dot.
  const onMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    const plotStart = 46 / width;
    const plotWidth = (width - 46 - 14) / width;
    const position = (ratio - plotStart) / plotWidth;
    const index = Math.round(position * Math.max(labels.length - 1, 1));
    setHover(index >= 0 && index < labels.length ? index : null);
  };

  const hasHover = hover !== null;
  const formatValue = VALUE_FORMAT[format];
  const tickLabel = tickFormatter(format, ticks);

  const showLabel = labelledIndices(labels.length);

  return (
    <div className={styles.wrap}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className={styles.svg}
        style={{ aspectRatio: `${width} / ${height}` }}
        role="img"
        aria-label={`${series.map((entry) => entry.label).join(", ")} over ${labels.length} points`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <clipPath id={clipId}>
            <rect
              x={46}
              y={0}
              width={width - 46 - 14}
              height={height - 26}
            />
          </clipPath>
        </defs>

        {/* Grid and axis are recessive - they orient, they don't compete. */}
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

        {reference && (
          <g>
            <line
              x1={46}
              x2={width - 14}
              y1={scale.y(reference.value)}
              y2={scale.y(reference.value)}
              stroke="var(--axis)"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
            <text
              x={width - 16}
              y={scale.y(reference.value) - 5}
              textAnchor="end"
              className={styles.referenceText}
            >
              {reference.label}
            </text>
          </g>
        )}

        <g clipPath={`url(#${clipId})`}>
          {paths.map((entry) => (
            <g key={entry.key}>
              {entry.area && (
                <path d={entry.area} fill={slotVar(entry)} opacity={0.14} />
              )}
              <path
                d={entry.line}
                fill="none"
                stroke={slotVar(entry)}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          ))}
        </g>

        {hasHover && (
          <line
            x1={scale.x(hover)}
            x2={scale.x(hover)}
            y1={12}
            y2={height - 26}
            stroke="var(--axis)"
            strokeWidth={1}
          />
        )}

        {hasHover &&
          paths.map((entry) => {
            const value = entry.values[hover];
            if (value === null || value === undefined) return null;
            return (
              <circle
                key={entry.key}
                cx={scale.x(hover)}
                cy={scale.y(value)}
                r={4.5}
                fill={slotVar(entry)}
                // A 2px ring in the surface colour keeps overlapping marks
                // readable where two series cross.
                stroke="var(--surface-1)"
                strokeWidth={2}
              />
            );
          })}

        {labels.map((label, index) =>
          showLabel.has(index) ? (
            <text
              key={`${label}-${index}`}
              x={scale.x(index)}
              y={height - 8}
              textAnchor="middle"
              className={styles.axisText}
            >
              {label}
            </text>
          ) : null,
        )}
      </svg>

      {yLabel && <span className={styles.yLabel}>{yLabel}</span>}

      {hasHover && (
        <div
          className={styles.tooltip}
          style={tooltipPosition(scale.x(hover) / width)}
          role="status"
        >
          <div className={styles.tooltipTitle}>{labels[hover]}</div>
          {paths.map((entry) => {
            const value = entry.values[hover];
            return (
              <div key={entry.key} className={styles.tooltipRow}>
                <span
                  className={styles.swatch}
                  style={{ background: slotVar(entry) }}
                  aria-hidden="true"
                />
                <span className={styles.tooltipLabel}>{entry.label}</span>
                <span className={`${styles.tooltipValue} numeric`}>
                  {value === null || value === undefined ? "no data" : formatValue(value)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {series.length > 1 && (
        <ul className={styles.legend}>
          {series.map((entry) => (
            <li key={entry.key} className={styles.legendItem}>
              <span
                className={styles.swatch}
                style={{ background: slotVar(entry) }}
                aria-hidden="true"
              />
              {entry.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
