import { linePath, makeScale, niceDomain, type Point } from "./scale";
import styles from "./sparkline.module.scss";

type Props = {
  values: (number | null)[];
  // Shown as a caption for screen readers and as the table cell's title, since
  // a 90px sparkline carries no numbers of its own.
  label: string;
  slot?: number;
  width?: number;
  height?: number;
  // Marks where data is missing rather than letting the line jump the gap.
  showGaps?: boolean;
};

// Deliberately inert: these live many-to-a-table, and a tooltip per row would
// fight the row hover. The figures beside them carry the detail.
export default function Sparkline({
  values,
  label,
  slot = 1,
  width = 96,
  height = 26,
  showGaps = true,
}: Props) {
  const present = values.filter((value): value is number => value !== null);
  if (!present.length) {
    return <span className={styles.empty}>no data</span>;
  }

  const padding = { top: 3, right: 2, bottom: 3, left: 2 };
  const scale = makeScale(width, height, values.length, niceDomain(present), padding);
  const points: Point[] = values.map((value, index) => ({ x: index, y: value }));
  const lastIndex = values.findLastIndex((value) => value !== null);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={styles.spark}
      role="img"
      aria-label={label}
    >
      {showGaps &&
        values.map((value, index) =>
          value === null ? (
            <line
              key={index}
              x1={scale.x(index)}
              x2={scale.x(index)}
              y1={2}
              y2={height - 2}
              stroke="var(--status-critical)"
              strokeWidth={1}
              opacity={0.35}
            />
          ) : null,
        )}
      <path
        d={linePath(points, scale)}
        fill="none"
        stroke={`var(--series-${slot})`}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {lastIndex >= 0 && (
        <circle
          cx={scale.x(lastIndex)}
          cy={scale.y(values[lastIndex] as number)}
          r={2}
          fill={`var(--series-${slot})`}
        />
      )}
    </svg>
  );
}
