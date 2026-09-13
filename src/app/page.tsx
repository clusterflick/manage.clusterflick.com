import Link from "next/link";
import AlertList from "@/components/alert-list";
import Panel from "@/components/panel";
import PageHeader from "@/components/page-header";
import StatTile from "@/components/stat-tile";
import StatGrid from "@/components/stat-tile/grid";
import StatusPill from "@/components/status-pill";
import Sparkline from "@/components/charts/sparkline";
import { overview } from "@/lib/reports";
import { cacheStatus, failureStatus, rateStatus } from "@/lib/status";
import {
  count,
  dateTimeLabel,
  duration,
  money,
  percent,
  relativeTime,
  signedPercent,
} from "@/lib/format";
import styles from "./page.module.scss";

export default function OverviewPage() {
  const { catalogue, llm, pipeline, health, alerts } = overview;
  // Rendered at build time, so it is the age at build rather than at read. The
  // line under the title says so instead of implying the page is live.
  const builtAt = new Date(overview.fetchedAt);

  const unassisted = pipeline.workflows.filter((workflow) => workflow.reportsUnassisted);
  const worstUnassisted = unassisted.reduce(
    (worst, workflow) =>
      (workflow.unassistedRate ?? 1) < (worst.unassistedRate ?? 1) ? workflow : worst,
    unassisted[0],
  );

  return (
    <>
      <PageHeader
        title="Overview"
        lede="Where the Clusterflick pipeline stands: what the catalogue looks like, what the LLM cost, how reliably the flows ran, and which sources stopped answering."
        meta={
          <>
            Built {dateTimeLabel(builtAt.toISOString())} from data-combined{" "}
            <span className="mono">{overview.release.combined.tag}</span>, generated{" "}
            {relativeTime(overview.dataGeneratedAt, builtAt.getTime())}. Figures are
            fixed at build time — rebuild to refresh.
          </>
        }
      />

      <Panel title="Needs attention" note="Every check the reports run, in one list. Each links to the page that explains it.">
        <AlertList alerts={alerts} />
      </Panel>

      <h2 className={styles.sectionHeading}>Catalogue</h2>
      <StatGrid>
        <StatTile
          label="Film match rate"
          value={percent(catalogue.filmMatchRate, 1)}
          detail={`${count(catalogue.unmatchedFilms)} film listings unmatched. Shorts, talks and events are excluded — they have no film to match to.`}
          severity={rateStatus(catalogue.filmMatchRate)}
          href="/catalogue"
        />
        <StatTile
          label="Poster coverage"
          value={percent(catalogue.posterCoverage, 1)}
          detail="Of movies that matched. A matched movie with no poster renders as a blank on the site."
          severity={rateStatus(catalogue.posterCoverage)}
          href="/catalogue#coverage"
        />
        <StatTile
          label="Movies tracked"
          value={count(catalogue.movies)}
          detail={`Across ${count(catalogue.venues)} venues`}
          href="/catalogue"
        />
        <StatTile
          label="Upcoming performances"
          value={count(catalogue.upcomingPerformances)}
          detail="Still ahead of the build time"
        />
      </StatGrid>

      {llm && (
        <>
          <h2 className={styles.sectionHeading}>LLM usage</h2>
          <StatGrid>
            <StatTile
              label={`Spend on ${llm.latestDate}`}
              value={money(llm.latestCost)}
              detail={`Mean ${money(llm.meanCostPerDay)}/day over the window${
                llm.weekOnWeek === null
                  ? ""
                  : ` · ${signedPercent(llm.weekOnWeek)} week on week`
              }`}
              href="/llm-usage"
            />
            <StatTile
              label="Cache hit rate"
              value={percent(llm.latestCacheHitRate)}
              detail="A cold cache is what makes a day expensive — the same work costs several times more."
              severity={cacheStatus(llm.latestCacheHitRate)}
              href="/llm-usage"
            />
            <StatTile
              label={`${llm.projection.month} projected`}
              value={money(llm.projection.projected)}
              detail={`${money(llm.projection.spentSoFar)} over ${llm.projection.daysSoFar} of ${llm.projection.daysInMonth} days, at the current rate`}
              href="/llm-usage"
            />
            <div className={styles.sparkTile}>
              <span className={styles.sparkLabel}>Daily spend</span>
              <Sparkline
                values={llm.sparkline}
                label={`Daily LLM spend over ${llm.sparkline.length} days`}
                width={170}
                height={46}
                showGaps={false}
              />
              <span className={styles.sparkDetail}>
                {llm.sparkline.length} days to {llm.latestDate}
              </span>
            </div>
          </StatGrid>
        </>
      )}

      <h2 className={styles.sectionHeading}>Pipeline</h2>
      <Panel
        note={`Completed runs over the last ${pipeline.windowDays} days. "Median run" is execution time across the jobs that ran, excluding time queued for a runner. "Unassisted" means the run finished first time with nobody stepping in — only meaningful on the three flows with no auto-rerun of their own.`}
        flush
      >
        <div className={styles.scroll}>
          <table className={styles.flowTable}>
            <thead>
              <tr>
                <th>Flow</th>
                <th className={styles.right}>Runs</th>
                <th className={styles.right}>Succeeded</th>
                <th className={styles.right}>Unassisted</th>
                <th className={styles.right}>Median run</th>
                <th>Last run</th>
              </tr>
            </thead>
            <tbody>
              {pipeline.workflows.map((workflow) => (
                <tr key={workflow.key}>
                  <td>
                    <Link href={`/pipeline#${workflow.key}`} className={styles.flowName}>
                      {workflow.name}
                    </Link>
                  </td>
                  <td className={styles.right}>{count(workflow.runs)}</td>
                  <td className={styles.right}>
                    <StatusPill severity={rateStatus(workflow.successRate)}>
                      {percent(workflow.successRate)}
                    </StatusPill>
                  </td>
                  <td className={styles.right}>
                    {workflow.reportsUnassisted && workflow.unassistedRate !== null ? (
                      <StatusPill severity={rateStatus(workflow.unassistedRate)}>
                        {percent(workflow.unassistedRate)}
                      </StatusPill>
                    ) : (
                      <span className={styles.na} title="Auto-rerun or cancel-in-progress makes this figure meaningless for this flow">
                        n/a
                      </span>
                    )}
                  </td>
                  <td className={styles.right}>{duration(workflow.medianDurationMs)}</td>
                  <td className={styles.lastRun}>
                    {workflow.lastRun ? (
                      <a href={workflow.lastRun.url} target="_blank" rel="noreferrer">
                        {relativeTime(workflow.lastRun.startedAt, builtAt.getTime())}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {health && (
        <>
          <h2 className={styles.sectionHeading}>Venue health</h2>
          <StatGrid>
            <StatTile
              label="Probe failure rate"
              value={percent(health.failureRate, 2)}
              detail={`${count(health.probes)} probes across ${health.venues} sources over ${health.days} days`}
              severity={failureStatus(health.failureRate)}
              href="/venues"
            />
            <StatTile
              label="Sources with failures"
              value={`${health.venuesWithFailures} / ${health.venues}`}
              detail="At least one probe came back with nothing"
              href="/venues"
            />
            {worstUnassisted && (
              <StatTile
                label="Least reliable flow"
                value={worstUnassisted.name}
                detail={`${percent(worstUnassisted.unassistedRate)} of runs finished first time unaided`}
                severity={rateStatus(worstUnassisted.unassistedRate)}
                href={`/pipeline#${worstUnassisted.key}`}
              />
            )}
          </StatGrid>
        </>
      )}
    </>
  );
}
