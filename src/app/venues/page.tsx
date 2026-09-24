import Panel from "@/components/panel";
import PageHeader from "@/components/page-header";
import StatTile from "@/components/stat-tile";
import StatGrid from "@/components/stat-tile/grid";
import LineChart from "@/components/charts/line-chart";
import HealthTable from "./health-table";
import { health, overview } from "@/lib/reports";
import StatusPill from "@/components/status-pill";
import RelativeTime from "@/components/relative-time";
import { failureStatus } from "@/lib/status";
import {
  count,
  dateLabel,
  dateTimeLabel,
  duration,
  percent,
} from "@/lib/format";
import styles from "./page.module.scss";

export const metadata = { title: "Venues — Clusterflick manage" };

export default function VenuesPage() {
  if (health.empty) {
    return <PageHeader title="Venues" meta="No health probes have been collected yet." />;
  }

  const builtAt = new Date(overview.fetchedAt).getTime();
  const failing = health.venues.filter((venue) => venue.currentOutage);
  const lastCycleAt = health.cycles[health.cycles.length - 1];

  return (
    <>
      <PageHeader
        title="Venue health"
        meta={
          <>
            {count(health.window.probes)} probes across {health.window.venues} sources,{" "}
            {health.window.cycles} cycles over {health.window.days} days (
            {health.window.firstDay} to {health.window.lastDay})
          </>
        }
      />

      <Panel
        id="failing"
        title={
          failing.length
            ? `${failing.length} ${failing.length === 1 ? "source is" : "sources are"} failing`
            : "Every source is answering"
        }
        note={
          <>
            As of the latest probe cycle, <RelativeTime value={lastCycleAt} builtAt={builtAt} /> (
            {dateTimeLabel(lastCycleAt)}).
          </>
        }
        actions={
          <StatusPill severity={failing.length ? "critical" : "good"}>
            {failing.length ? `${failing.length} failing` : "all clear"}
          </StatusPill>
        }
        flush={failing.length > 0}
      >
        {failing.length > 0 ? (
          <div className={styles.scroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Kind</th>
                  <th>Latest error</th>
                  <th className={styles.right}>Failing since</th>
                </tr>
              </thead>
              <tbody>
                {failing.map((venue) => {
                  const outage = venue.currentOutage!;
                  return (
                    <tr key={venue.venue}>
                      <td className={`${styles.venueId} mono`}>{venue.venue}</td>
                      <td className={styles.nowrap}>{outage.kind}</td>
                      <td className={styles.message}>{outage.message ?? "—"}</td>
                      <td className={`${styles.right} ${styles.nowrap}`}>
                        {outage.lastOkAt ? dateTimeLabel(outage.since) : "whole window"}
                        <div className={styles.subFigure}>
                          {count(outage.probes)} {outage.probes === 1 ? "probe" : "probes"} in a row
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={styles.allClear}>
            All {health.window.venues} sources answered their latest probe.
          </p>
        )}
      </Panel>

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
          detail={`At least one failed probe over the ${health.window.days} days`}
        />
        <StatTile
          label="Cycles"
          value={count(health.window.cycles)}
          detail={`Over ${health.window.days} days — about ${Math.round(health.window.cycles / health.window.days)} a day`}
        />
      </StatGrid>

      <Panel
        title="Failure rate by hour"
        note="One point per probe cycle. A chain blocking or going down fails all of its venues at once, so it shows as a sustained step rather than a blip."
      >
        <LineChart
          series={[
            {
              key: "failureRate",
              label: "Failure rate",
              values: health.byCycle.map((cycle) => cycle.failureRate),
              slot: 2,
              area: true,
            },
          ]}
          labels={health.byCycle.map((cycle) => dateTimeLabel(cycle.at))}
          axisLabels={health.byCycle.map((cycle) => dateLabel(cycle.at))}
          format="percent"
          height={180}
        />
      </Panel>

      <Panel
        title="Sources"
        note="One row per source, worst first. A break in the sparkline is a probe that returned nothing. Expand a row for what its failures were."
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
