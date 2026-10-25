// How much data the self-hosted runners pull down on the 5G router they share.
//
// Two sources, and neither is the daily figure on its own:
//
//   - The router's counters, read hourly. Each reading is the running total
//     for the router's month, so usage is the difference between consecutive
//     readings. The total drops back when the router's month rolls over or the
//     router restarts; a drop is read as "the counter started again", so the
//     interval's usage is the new reading itself - what came through since the
//     reset - and only the stretch between the last reading and the reset is
//     lost.
//   - Smarty's own daily history, imported by hand. It covers the days before
//     the readings started, and any day they don't cover in full.
//
// An interval that spans midnight is split between the two days in proportion
// to the time on each side. Readings are hourly, so that is a guess about one
// hour at most - unless the runners were too busy to take one, which the
// proportional split degrades gracefully across rather than dumping a whole
// gap onto whichever day the late reading landed on.

import { londonDay, mean, round, sum } from "./stats.mjs";

export const WINDOW_DAYS = 30;

// How many of the most recent readings the hourly chart shows: two days.
const RECENT_INTERVALS = 48;

const DAY_MS = 86400000;

// The UTC instant of midnight starting a London day. Midnight is either 00:00Z
// (GMT) or 23:00Z the day before (BST); whichever London reads as 00:00 on that
// date is the one.
function londonMidnight(date) {
  const utc = Date.parse(`${date}T00:00:00Z`);
  for (const candidate of [utc, utc - 3600000]) {
    const hour = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(new Date(candidate));
    if (londonDay(candidate) === date && hour === "00") return candidate;
  }
  throw new Error(`No London midnight found for ${date}`);
}

const nextDay = (date) =>
  new Date(Date.parse(`${date}T12:00:00Z`) + DAY_MS).toISOString().slice(0, 10);

const previousDay = (date) =>
  new Date(Date.parse(`${date}T12:00:00Z`) - DAY_MS).toISOString().slice(0, 10);

// Usage between each pair of consecutive readings.
function intervalsOf(readings) {
  const intervals = [];
  for (let index = 1; index < readings.length; index += 1) {
    const from = readings[index - 1];
    const to = readings[index];
    const reset = to.rx < from.rx || to.tx < from.tx;
    intervals.push({
      from: Date.parse(from.at),
      to: Date.parse(to.at),
      down: reset ? to.rx : to.rx - from.rx,
      up: reset ? to.tx : to.tx - from.tx,
      reset,
    });
  }
  return intervals;
}

// Each interval's usage spread over the London days it touches.
function routerDays(intervals) {
  const days = new Map();
  for (const interval of intervals) {
    const span = interval.to - interval.from;
    if (span <= 0) continue;
    let start = interval.from;
    while (start < interval.to) {
      const date = londonDay(start);
      const end = Math.min(interval.to, londonMidnight(nextDay(date)));
      const share = (end - start) / span;
      const day = days.get(date) ?? { down: 0, up: 0, resets: 0 };
      day.down += interval.down * share;
      day.up += interval.up * share;
      if (interval.reset && end === interval.to) day.resets += 1;
      days.set(date, day);
      start = end;
    }
  }
  return days;
}

// Smarty's billing cycle containing `date`: from the cycle's start day of the
// month to the day before it, a month on.
function cycleContaining(date, startDay) {
  const [year, month, day] = date.split("-").map(Number);
  const startMonth = day >= startDay ? month - 1 : month - 2;
  const start = new Date(Date.UTC(year, startMonth, startDay));
  const end = new Date(Date.UTC(year, startMonth + 1, startDay - 1));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

const daysBetween = (from, to) =>
  Math.round(
    (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / DAY_MS,
  ) + 1;

export default function buildBandwidthReport(
  { readings, smarty },
  now = Date.now(),
) {
  const smartyDays = smarty?.days ?? {};
  if (!readings.length && !Object.keys(smartyDays).length) {
    return { empty: true };
  }

  const today = londonDay(now);
  const intervals = intervalsOf(readings);
  const byRouter = routerDays(intervals);
  const firstReading = readings.length ? Date.parse(readings[0].at) : null;
  const lastReading = readings.length ? Date.parse(readings.at(-1).at) : null;

  // A router day is complete when readings bracket it - one at or before its
  // midnight and one at or after the next. Anything less is part of a day.
  const routerComplete = (date) =>
    firstReading !== null &&
    firstReading <= londonMidnight(date) &&
    lastReading >= londonMidnight(nextDay(date));

  const dates = [];
  for (let date = today, n = 0; n < WINDOW_DAYS; n += 1) {
    dates.unshift(date);
    date = previousDay(date);
  }

  const allDays = dates.map((date) => {
    const router = byRouter.get(date);
    const routerBytes = router ? Math.round(router.down + router.up) : null;
    const routerIsComplete = Boolean(router) && routerComplete(date);
    const fromSmarty = smartyDays[date] ?? null;

    // A complete count beats a partial one, and the router's beats Smarty's
    // when both are complete - it is the one with the split, and the series
    // going forward. Between two partial counts (today, usually), the larger
    // has seen more of the day: both can only be short.
    let source = null;
    if (routerIsComplete) source = "router";
    else if (fromSmarty?.complete) source = "smarty";
    else if (router && fromSmarty)
      source = routerBytes >= fromSmarty.bytes ? "router" : "smarty";
    else if (router) source = "router";
    else if (fromSmarty) source = "smarty";

    return {
      date,
      source,
      bytes:
        source === "router"
          ? routerBytes
          : source === "smarty"
            ? fromSmarty.bytes
            : null,
      complete:
        source === "router"
          ? routerIsComplete
          : source === "smarty"
            ? fromSmarty.complete
            : false,
      down: source === "router" ? Math.round(router.down) : null,
      up: source === "router" ? Math.round(router.up) : null,
      resets: router?.resets ?? 0,
      // Both figures for a day both sources have in full, so the two can be
      // checked against each other.
      routerBytes: routerIsComplete ? routerBytes : null,
      smartyBytes: fromSmarty?.complete ? fromSmarty.bytes : null,
    };
  });
  // Starting at the first day either source has, so a history shorter than
  // the window isn't drawn as weeks of nothing ahead of it. A day missing
  // after that stays in, as the gap it is.
  const days = allDays.slice(
    Math.max(
      allDays.findIndex((day) => day.source !== null),
      0,
    ),
  );

  const completeDays = days.filter((day) => day.complete);
  const completeBytes = completeDays.map((day) => day.bytes);
  const latestComplete = completeDays.at(-1) ?? null;

  // The cycle the account bills by. Without a Smarty import there is no cycle
  // to go on, so it falls back to calendar months.
  const cycleStartDay = smarty?.cycleStart
    ? Number(smarty.cycleStart.slice(8, 10))
    : 1;
  const cycle = cycleContaining(today, cycleStartDay);
  const cycleDays = days.filter((day) => day.date >= cycle.start);
  const cycleSoFar = sum(cycleDays.map((day) => day.bytes ?? 0));
  const cycleCompleteBytes = cycleDays
    .filter((day) => day.complete)
    .map((day) => day.bytes);
  const cycleLength = daysBetween(cycle.start, cycle.end);
  const cycleElapsed = daysBetween(cycle.start, today);

  const compared = days.filter(
    (day) => day.routerBytes !== null && day.smartyBytes !== null,
  );

  const latest = readings.at(-1) ?? null;

  return {
    empty: false,
    generatedAt: new Date(now).toISOString(),
    window: {
      days: days.length,
      firstDate: days[0].date,
      lastDate: today,
    },
    days,
    perDay: {
      mean: completeBytes.length ? Math.round(mean(completeBytes)) : null,
      max: completeBytes.length ? Math.max(...completeBytes) : null,
      completeDays: completeBytes.length,
    },
    latestComplete,
    cycle: {
      ...cycle,
      startDay: cycleStartDay,
      fromSmarty: Boolean(smarty?.cycleStart),
      length: cycleLength,
      elapsed: cycleElapsed,
      soFar: cycleSoFar,
      // The cycle's complete days at their mean, carried across the whole
      // cycle. Null until there is a complete day to go on.
      projected: cycleCompleteBytes.length
        ? Math.round(mean(cycleCompleteBytes) * cycleLength)
        : null,
    },
    // How far the router's count is from Smarty's on days both have in full:
    // the router's over Smarty's, minus one. Smarty is the one that bills.
    agreement: compared.length
      ? {
          days: compared.length,
          difference: round(
            sum(compared.map((day) => day.routerBytes)) /
              sum(compared.map((day) => day.smartyBytes)) -
              1,
          ),
        }
      : null,
    router: latest
      ? {
          readings: readings.length,
          firstAt: readings[0].at,
          latestAt: latest.at,
          resetDay: latest.resetDay ?? null,
          autoReset: latest.autoReset ?? null,
          // The hour-by-hour view: what each interval between readings used.
          recent: intervals.slice(-RECENT_INTERVALS).map((interval) => ({
            at: new Date(interval.to).toISOString(),
            minutes: Math.round((interval.to - interval.from) / 60000),
            down: interval.down,
            up: interval.up,
            reset: interval.reset,
          })),
        }
      : null,
    smarty: smarty
      ? {
          updatedAt: smarty.updatedAt,
          cycleStart: smarty.cycleStart,
          firstDate: Object.keys(smartyDays).sort()[0] ?? null,
        }
      : null,
  };
}
