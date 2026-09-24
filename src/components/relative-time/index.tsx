"use client";

import { useSyncExternalStore } from "react";
import { dateTimeLabel, relativeTime } from "@/lib/format";

// One clock for every timestamp on the page, ticking once a minute - the
// coarsest unit `relativeTime` prints - so a page left open keeps counting
// rather than freezing at whatever it said when it was opened.
const TICK_MS = 60_000;
let now = Date.now();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      listeners.forEach((notify) => notify());
    }, TICK_MS);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

const getSnapshot = () => now;

type Props = {
  value: string | number | null | undefined;
  // When the site was built. The static HTML is rendered against it, and
  // hydration has to match that HTML before the viewer's clock takes over -
  // so with JavaScript off the page still reads as it did at build.
  builtAt: number;
};

export default function RelativeTime({ value, builtAt }: Props) {
  const current = useSyncExternalStore(subscribe, getSnapshot, () => builtAt);
  if (value === null || value === undefined) return "—";
  return (
    <time dateTime={new Date(value).toISOString()} title={dateTimeLabel(value)}>
      {relativeTime(value, current)}
    </time>
  );
}
