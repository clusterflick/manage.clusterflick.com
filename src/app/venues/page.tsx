import Panel from "@/components/panel";
import PageHeader from "@/components/page-header";
import StatTile from "@/components/stat-tile";
import StatGrid from "@/components/stat-tile/grid";
import LineChart from "@/components/charts/line-chart";
import HealthTable from "./health-table";
import { health, overview } from "@/lib/reports";
import { failureStatus } from "@/lib/status";
import { count, dateLabel, dateTimeLabel, duration, percent } from "@/lib/format";
import styles from "./page.module.scss";

export const metadata = { title: "Venues — Clusterflick manage" };

// What each failure kind actually means, so a fortnight of 503s is not read as
// a scraper to fix.
const KIND_MEANING: Record<string, string> = {
  "probe-error": "The probe itself failed — a timeout, a bad status, or a fetch that never completed. Ours to fix.",
  "source-maintenance": "The venue answered with a maintenance status. Theirs to fix; worth watching if it persists.",
  "source-queue": "The venue put the probe in a virtual waiting room. Expected around on-sales.",
  "no-counts": "The probe completed but reported no counts at all.",
};

export default function VenuesPage() {
  if (health.empty) {
    return <PageHeader title="Venues" lede="No health probes have been collected yet." />;
  }

  const builtAt = new Date(overview.fetchedAt).getTime();

  return (
    <>
      <PageHeader
        title="Venue health"
        lede="Whether each source is still answering, and with how much. The health workflow probes these sources several times a day; a probe that comes back with nothing is recorded with the reason it gave. Counts are never summed across sources — a chain answering with individual performances and one answering with a film-by-date matrix are counting different things, so only films and dates are comparable everywhere."
        meta={
          <>
            {count(health.window.probes)} probes across {health.window.venues} sources,{" "}
            {health.window.cycles} cycles over {health.window.days} days (
            {health.window.firstDay} to {health.window.lastDay})
          </>
        }
      />

      <StatGrid>
        <StatTile
          label="Probe failure rate"
          value={percent(health.totals.failureRate, 2)}
          detail={`${count(health.totals.failures)} of ${count(health.window.probes)} probes came back with nothing`}
          severity={failureStatus(health.totals.failureRate)}
        />
        <StatTile
          label="Sources with failures"
          value={`${health.totals.venuesWithFailures} / ${health.window.venues}`}
          detail="At least one failed probe in the window"
        />
        <StatTile
          label="Cycles"
          value={count(health.window.cycles)}
          detail={`Over ${health.window.days} days — about ${Math.round(health.window.cycles / health.window.days)} a day`}
        />
      </StatGrid>

      <Panel
        title="Failure rate by day"
        note="Grouped by the release each row came from, which is a London day. The timestamp inside a row is UTC, so through BST a day's first cycle carries the previous date — grouping on that would split days in the wrong place."
      >
        <LineChart
          series={[
            {
              key: "failureRate",
              label: "Failure rate",
              values: health.byDay.map((day) => day.failureRate),
              slot: 2,
              area: true,
            },
          ]}
          labels={health.byDay.map((day) =>
            dateLabel(
              `${day.day.slice(0, 4)}-${day.day.slice(4, 6)}-${day.day.slice(6, 8)}T12:00:00Z`,
            ),
          )}
          format="percent"
          height={180}
        />
      </Panel>

      <Panel
        title="Why probes failed"
        note="Grouped by what the probe reported. Whose fault it was matters: a source in maintenance or a queue is telling us to come back later, and is not a scraper to go and fix."
        flush
      >
        <div className={styles.scroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Kind</th>
                <th className={styles.right}>Probes</th>
                <th>Sources affected</th>
              </tr>
            </thead>
            <tbody>
              {health.byKind.map((kind) => (
                <tr key={kind.kind}>
                  <td>
                    <div className={styles.kindName}>{kind.kind}</div>
                    <div className={styles.kindMeaning}>
                      {KIND_MEANING[kind.kind] ?? "Not a kind this report has been taught."}
                    </div>
                  </td>
                  <td className={styles.right}>{count(kind.count)}</td>
                  <td className={`${styles.sources} mono`}>{kind.venues.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        title="Sources"
        note="One row per source, worst first. The sparkline is films per probe across the window; a break in the line is a probe that returned nothing, which is deliberately not drawn as a zero — a source answering “no films” and a source not answering are different things."
        flush
      >
        <HealthTable
          venues={health.venues}
          cycles={health.window.cycles}
          builtAt={builtAt}
        />
      </Panel>

      <Panel
        title="Recent failures"
        note="Most recent first, with the message the probe came back with."
        flush
      >
        <div className={styles.scroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>When</th>
                <th>Source</th>
                <th>Kind</th>
                <th>Detail</th>
                <th className={styles.right}>Took</th>
              </tr>
            </thead>
            <tbody>
              {health.failures.map((failure) => (
                <tr key={`${failure.venue}-${failure.at}`}>
                  <td className={styles.nowrap}>{dateTimeLabel(failure.at)}</td>
                  <td className="mono">{failure.venue}</td>
                  <td className={styles.nowrap}>{failure.kind}</td>
                  <td className={styles.message}>
                    {failure.message ?? (failure.status ? `status ${failure.status}` : "—")}
                  </td>
                  <td className={styles.right}>{duration(failure.durationMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
