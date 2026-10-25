import Panel from "@/components/panel";
import PageHeader from "@/components/page-header";
import RelativeTime from "@/components/relative-time";
import StatTile from "@/components/stat-tile";
import StatGrid from "@/components/stat-tile/grid";
import StackedBars from "@/components/charts/stacked-bars";
import { bandwidth, type BandwidthDay } from "@/lib/reports";
import {
  bytes,
  count,
  dateLabel,
  dateTimeLabel,
  signedPercent,
  timeLabel,
} from "@/lib/format";
import styles from "./page.module.scss";

export const metadata = { title: "Bandwidth — Clusterflick manage" };

const dayLabel = (date: string) => dateLabel(`${date}T12:00:00Z`);

const SOURCE_LABEL = { router: "Router", smarty: "Smarty" } as const;

function dayNotes(day: BandwidthDay): string[] {
  const notes = [];
  if (day.source && !day.complete) notes.push("part day");
  if (day.resets) notes.push("counter reset");
  return notes;
}

export default function BandwidthPage() {
  if (bandwidth.empty) {
    return (
      <PageHeader
        title="Bandwidth"
        meta="No router readings or Smarty history have been collected yet."
      />
    );
  }

  const { days, router, smarty, cycle, perDay, latestComplete, agreement } =
    bandwidth;
  const builtAt = new Date(bandwidth.generatedAt).getTime();
  const labels = days.map((day) => dayLabel(day.date));

  const fromRouter = (day: BandwidthDay, field: "down" | "up") =>
    day.source === "router" ? (day[field] ?? 0) : 0;

  // Where the router takes over from Smarty, so the change in colour reads as
  // a change of source rather than of usage.
  const firstRouterDay = days.findIndex((day) => day.source === "router");
  const sourceMarkers =
    firstRouterDay > 0 &&
    days.slice(0, firstRouterDay).some((day) => day.source === "smarty")
      ? [{ index: firstRouterDay, label: "Router readings start" }]
      : [];

  // Only a router that clears its counter on a schedule has a month to line
  // up. With automatic clearing off, the counter only drops on a restart.
  // The router doesn't always report the switch, and one that gives a reset
  // day without it is taken at its word - only an explicit "off" says it
  // never clears.
  const autoResets = router?.autoReset !== false && Boolean(router?.resetDay);
  const resetDayMismatch =
    autoResets && cycle.fromSmarty && router?.resetDay !== cycle.startDay;

  return (
    <>
      <PageHeader
        title="Bandwidth"
        meta={
          <>
            Data used on the 5G router the self-hosted runners share, over the
            last {bandwidth.window.days} days.{" "}
            {router ? (
              <>
                {count(router.readings)} router readings since{" "}
                {dateTimeLabel(router.firstAt)}, the latest{" "}
                <RelativeTime value={router.latestAt} builtAt={builtAt} />.
              </>
            ) : (
              <>No router readings yet.</>
            )}{" "}
            {smarty ? (
              <>
                Smarty history from {dayLabel(smarty.firstDate ?? "")}, imported{" "}
                {dateTimeLabel(smarty.updatedAt)}.
              </>
            ) : (
              <>No Smarty history imported.</>
            )}
          </>
        }
      />

      <StatGrid>
        <StatTile
          label={
            latestComplete
              ? `Used on ${dayLabel(latestComplete.date)}`
              : "Latest full day"
          }
          value={bytes(latestComplete?.bytes)}
          detail={
            latestComplete
              ? latestComplete.source === "router"
                ? `${bytes(latestComplete.down)} down · ${bytes(latestComplete.up)} up, from the router`
                : "From Smarty's history"
              : "No full day counted yet"
          }
        />
        <StatTile
          label="Mean per day"
          value={bytes(perDay.mean)}
          detail={`Over ${perDay.completeDays} full ${perDay.completeDays === 1 ? "day" : "days"} · peak ${bytes(perDay.max)}`}
        />
        <StatTile
          label="This cycle so far"
          value={bytes(cycle.soFar)}
          detail={`Day ${cycle.elapsed} of ${cycle.length}, ${dayLabel(cycle.start)} to ${dayLabel(cycle.end)}${cycle.fromSmarty ? "" : " (calendar month - no Smarty cycle imported)"}`}
        />
        <StatTile
          label="Cycle projected"
          value={bytes(cycle.projected)}
          detail="The cycle's full days at their mean, across the whole cycle"
        />
      </StatGrid>

      <Panel
        title="Usage per day"
        note="Router days are split into download and upload; Smarty only reports a day's total. A day counts from the router when its hourly readings cover all of it, and falls back to Smarty otherwise. Today, and any day the readings only partly cover, is a part day and short of its eventual total."
      >
        <StackedBars
          series={[
            {
              key: "down",
              label: "Download (router)",
              slot: 1,
              values: days.map((day) => fromRouter(day, "down")),
            },
            {
              key: "up",
              label: "Upload (router)",
              slot: 2,
              values: days.map((day) => fromRouter(day, "up")),
            },
            {
              key: "smarty",
              label: "Total (Smarty)",
              slot: 3,
              values: days.map((day) =>
                day.source === "smarty" ? (day.bytes ?? 0) : 0,
              ),
            },
          ]}
          labels={labels}
          format="bytes"
          markers={sourceMarkers}
        />
      </Panel>

      {router && router.recent.length > 0 && (
        <Panel
          title="Hour by hour"
          note={
            <>
              What each interval between readings used, labelled by the reading
              that closed it. A bar wider than an hour&apos;s worth is a reading
              that ran late, usually because every runner was busy. A dashed
              line is the counter resetting -{" "}
              {autoResets
                ? `the router's month rolling over on day ${router.resetDay}, or a restart -`
                : "a restart, as the router isn't set to clear it on a schedule -"}{" "}
              where the usage between the last reading and the reset is lost.
            </>
          }
        >
          <StackedBars
            series={[
              {
                key: "down",
                label: "Download",
                slot: 1,
                values: router.recent.map((interval) => interval.down),
              },
              {
                key: "up",
                label: "Upload",
                slot: 2,
                values: router.recent.map((interval) => interval.up),
              },
            ]}
            labels={router.recent.map(
              (interval) =>
                `${dateLabel(interval.at)} ${timeLabel(interval.at)}`,
            )}
            format="bytes"
            markers={router.recent.flatMap((interval, index) =>
              interval.reset ? [{ index, label: "Counter reset" }] : [],
            )}
          />
        </Panel>
      )}

      {router && resetDayMismatch && (
        <Panel title="Router month doesn't match the billing cycle">
          <p className={styles.note}>
            The router resets its counter on day {router.resetDay} of the month,
            but Smarty bills from day {cycle.startDay}. The daily figures here
            are unaffected - they come from differences between readings - but
            the router&apos;s own &ldquo;this month&rdquo; figure won&apos;t
            match Smarty&apos;s. Set the router&apos;s statistics reset day to{" "}
            {cycle.startDay} to line them up.
          </p>
        </Panel>
      )}

      <Panel
        title="By day"
        note={
          agreement ? (
            <>
              On the {agreement.days} {agreement.days === 1 ? "day" : "days"}{" "}
              both sources counted in full, the router came to{" "}
              {signedPercent(agreement.difference)} against Smarty. Smarty is
              the one that bills.
            </>
          ) : (
            "Where both sources have counted a day in full, both figures are shown so they can be checked against each other."
          )
        }
        flush
      >
        <div className={styles.scroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Day</th>
                <th>Source</th>
                <th className={styles.right}>Download</th>
                <th className={styles.right}>Upload</th>
                <th className={styles.right}>Total</th>
                <th className={styles.right}>Smarty</th>
                <th className={styles.right}>Router vs Smarty</th>
              </tr>
            </thead>
            <tbody>
              {[...days].reverse().map((day) => (
                <tr key={day.date}>
                  <td className={styles.strong}>
                    {dayLabel(day.date)}
                    {dayNotes(day).map((note) => (
                      <span key={note} className={styles.tag}>
                        {note}
                      </span>
                    ))}
                  </td>
                  <td>{day.source ? SOURCE_LABEL[day.source] : "—"}</td>
                  <td className={styles.right}>{bytes(day.down)}</td>
                  <td className={styles.right}>{bytes(day.up)}</td>
                  <td className={`${styles.right} ${styles.strong}`}>
                    {bytes(day.bytes)}
                  </td>
                  <td className={styles.right}>{bytes(day.smartyBytes)}</td>
                  <td className={styles.right}>
                    {day.routerBytes !== null && day.smartyBytes
                      ? signedPercent(day.routerBytes / day.smartyBytes - 1)
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
