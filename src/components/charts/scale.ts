// Scale and path maths shared by the charts. Kept apart from the components so
// the geometry can be reasoned about without React in the way.

export type Point = { x: number; y: number | null };

export const PLOT_PADDING = { top: 12, right: 14, bottom: 26, left: 46 };

export type Scale = {
  x: (value: number) => number;
  y: (value: number) => number;
  width: number;
  height: number;
  inner: { width: number; height: number };
  domainY: [number, number];
};

// A y-axis that always includes zero, so the eye reads bar and area heights as
// proportional to the value. Truncating the axis is the fastest way to make a
// 3% change look like a collapse.
export function niceDomain(values: number[], { includeZero = true } = {}): [number, number] {
  const finite = values.filter((value) => Number.isFinite(value));
  if (!finite.length) return [0, 1];
  let min = Math.min(...finite);
  let max = Math.max(...finite);
  if (includeZero) {
    min = Math.min(min, 0);
    max = Math.max(max, 0);
  }
  if (min === max) {
    // A flat series still needs a band to draw in, or the line lands on the
    // axis and reads as zero.
    const padding = Math.abs(max) || 1;
    return [min - padding * 0.5, max + padding * 0.5];
  }
  const step = niceStep((max - min) / 4);
  return [Math.floor(min / step) * step, Math.ceil(max / step) * step];
}

// Rounds an interval to 1, 2, 2.5 or 5 times a power of ten, so ticks land on
// numbers a reader recognises rather than on 0.037.
export function niceStep(rough: number): number {
  if (!Number.isFinite(rough) || rough <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalised = rough / magnitude;
  if (normalised <= 1) return magnitude;
  if (normalised <= 2) return 2 * magnitude;
  if (normalised <= 2.5) return 2.5 * magnitude;
  if (normalised <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

export function ticksFor([min, max]: [number, number], count = 4): number[] {
  const step = niceStep((max - min) / count);
  const ticks: number[] = [];
  for (let value = Math.ceil(min / step) * step; value <= max + step * 0.001; value += step) {
    // Floating point leaves 0.30000000000000004 on some steps; the label
    // formatter would print it verbatim.
    ticks.push(Math.round(value / step) * step);
  }
  return ticks;
}

export function makeScale(
  width: number,
  height: number,
  pointCount: number,
  domainY: [number, number],
  padding = PLOT_PADDING,
): Scale {
  const inner = {
    width: Math.max(width - padding.left - padding.right, 1),
    height: Math.max(height - padding.top - padding.bottom, 1),
  };
  const [minY, maxY] = domainY;
  const spanY = maxY - minY || 1;
  // A single point sits in the middle rather than hard against the left edge.
  const denominator = Math.max(pointCount - 1, 1);

  return {
    width,
    height,
    inner,
    domainY,
    x: (index) =>
      pointCount === 1
        ? padding.left + inner.width / 2
        : padding.left + (index / denominator) * inner.width,
    y: (value) => padding.top + inner.height - ((value - minY) / spanY) * inner.height,
  };
}

// Gaps are breaks in the line, not zeroes joined through - a venue that wasn't
// probed and a venue that reported nothing are different, and a line drawn
// straight across the gap asserts something the data does not say.
export function linePath(points: Point[], scale: Scale): string {
  let path = "";
  let penDown = false;
  points.forEach((point, index) => {
    if (point.y === null || !Number.isFinite(point.y)) {
      penDown = false;
      return;
    }
    const command = penDown ? "L" : "M";
    path += `${command}${scale.x(index).toFixed(2)},${scale.y(point.y).toFixed(2)}`;
    penDown = true;
  });
  return path;
}

// Area fills only the runs that have data, closing each run to the baseline
// separately so a gap stays a gap.
export function areaPath(points: Point[], scale: Scale, baseline: number): string {
  const baseY = scale.y(baseline);
  let path = "";
  let run: number[] = [];

  const flush = () => {
    if (run.length === 0) return;
    const first = run[0];
    const last = run[run.length - 1];
    path += `M${scale.x(first).toFixed(2)},${baseY.toFixed(2)}`;
    run.forEach((index) => {
      path += `L${scale.x(index).toFixed(2)},${scale.y(points[index].y as number).toFixed(2)}`;
    });
    path += `L${scale.x(last).toFixed(2)},${baseY.toFixed(2)}Z`;
    run = [];
  };

  points.forEach((point, index) => {
    if (point.y === null || !Number.isFinite(point.y)) flush();
    else run.push(index);
  });
  flush();
  return path;
}
