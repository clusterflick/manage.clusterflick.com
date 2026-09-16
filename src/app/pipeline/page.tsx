import Panel from "@/components/panel";
import PageHeader from "@/components/page-header";
import StatusPill from "@/components/status-pill";
import LineChart from "@/components/charts/line-chart";
import { pipeline } from "@/lib/reports";
import { rateStatus } from "@/lib/status";
import { count, dateLabel, dateTimeLabel, duration, percent } from "@/lib/format";
import styles from "./page.module.scss";

export const metadata = { title: "Pipeline — Clusterflick manage" };

export default function PipelinePage() {
  return (
    <>
      <PageHeader
        title="Pipeline stability"
        lede={
          <>
            How reliably each flow runs, over completed runs only. Two questions,
            kept apart because they answer to different things:{" "}
            <strong>did it work</strong> is the conclusion of every run, and{" "}
            <strong>did it work without help</strong> counts only runs that
            succeeded on the first attempt. The second is reported for retrieve,
            transform and match alone — those three have no auto-rerun of their
            own, so a second attempt can only mean a person clicked re-run. The
            rest carry a rerun-on-failure workflow or cancel-in-progress, where a
            later attempt says nothing about whether anyone was involved.
          </>
        }
        meta={
          <>
            Last {pipeline.windowDays} days, collected{" "}
            {dateTimeLabel(pipeline.collectedAt)}. Durations are{" "}
            <strong>execution time</strong>, measured across the jobs that
            actually ran, and average first-attempt successes only — GitHub
            rewrites a run&apos;s start time when it is re-run, so a retried
            run&apos;s elapsed time describes nothing real. Time spent queued for
            a runner is reported separately rather than folded in: one diff run
            waited 53 minutes and then built in 2m20s, and calling that a
            55-minute build says something false about the build.
          </>
        }
      />

      {pipeline.workflows.map((workflow) => {
        const series = workflow.durationSeries;
        // No runs collected. Said plainly rather than shown as zeroes: GitHub's
        // run list intermittently answers from a stale index, and a flow that
        // reported nothing must not read as a flow that did nothing.
        const noData = workflow.runs === 0;
        return (
          <Panel
            key={workflow.key}
            id={workflow.key}
            title={
              <span className={styles.flowTitle}>
                {workflow.name}
                <span className={`${styles.repo} mono`}>
                  {workflow.repo} · {workflow.workflow}
                </span>
              </span>
            }
            note={
              noData ? (
                <>
                  No run history came back for this flow. Every flow here runs at
                  least daily, so these figures are missing rather than zero —
                  GitHub&apos;s run list intermittently answers from a stale
                  index, months behind and with nothing in the response to say
                  so. Rebuilding usually clears it.
                </>
              ) : workflow.skippedNoOps > 0 ? (
                <>
                  {count(workflow.skippedNoOps)} runs are excluded: this flow opens
                  with a &ldquo;have we already released today?&rdquo; job, and when
                  it has, every other job is skipped. Those runs finish in seconds
                  having done nothing, and counting them would report a build time
                  of about nine seconds.
                </>
              ) : undefined
            }
            actions={
              <>
                <StatusPill severity={rateStatus(workflow.successRate)}>
                  {workflow.successRate === null
                    ? "no data"
                    : `${percent(workflow.successRate)} succeeded`}
                </StatusPill>
                {workflow.reportsUnassisted && workflow.unassistedRate !== null && (
                  <StatusPill severity={rateStatus(workflow.unassistedRate)}>
                    {percent(workflow.unassistedRate)} unassisted
                  </StatusPill>
                )}
              </>
            }
          >
            <div className={styles.summary}>
              <div className={styles.figure}>
                <span className={styles.figureLabel}>Runs</span>
                <span className={`${styles.figureValue} numeric`}>
                  {noData ? "—" : count(workflow.runs)}
                </span>
              </div>
              <div className={styles.figure}>
                <span className={styles.figureLabel}>Needed a hand</span>
                <span className={`${styles.figureValue} numeric`}>
                  {noData ? "—" : count(workflow.assistedRuns)}
                </span>
              </div>
              <div className={styles.figure}>
                <span className={styles.figureLabel}>Median run</span>
                <span className={`${styles.figureValue} numeric`}>
                  {duration(workflow.duration.medianMs)}
                </span>
              </div>
              <div className={styles.figure}>
                <span className={styles.figureLabel}>p90 run</span>
                <span className={`${styles.figureValue} numeric`}>
                  {duration(workflow.duration.p90Ms)}
                </span>
              </div>
              <div className={styles.figure}>
                <span className={styles.figureLabel}>Slowest run</span>
                <span className={`${styles.figureValue} numeric`}>
                  {duration(workflow.duration.maxMs)}
                </span>
              </div>
              <div className={styles.figure}>
                <span className={styles.figureLabel}>Worst queue wait</span>
                <span className={`${styles.figureValue} numeric`}>
                  {duration(workflow.queue.maxMs)}
                </span>
                <span className={styles.figureAside}>
                  median {duration(workflow.queue.medianMs)}
                </span>
              </div>
              <div className={styles.figure}>
                <span className={styles.figureLabel}>Last run</span>
                <span className={styles.figureValue}>
                  {workflow.lastRun ? (
                    <a href={workflow.lastRun.url} target="_blank" rel="noreferrer">
                      {dateTimeLabel(workflow.lastRun.startedAt)}
                    </a>
                  ) : (
                    "—"
                  )}
                </span>
              </div>
            </div>

            {series.length > 1 ? (
              <LineChart
                series={[
                  {
                    key: "duration",
                    label: `${workflow.name} duration`,
                    values: series.map((run) => run.durationMs),
                    slot: 1,
                  },
                ]}
                labels={series.map((run) => dateLabel(run.startedAt))}
                format="duration"
                height={170}
                reference={
                  workflow.duration.medianMs
                    ? {
                        value: workflow.duration.medianMs,
                        label: `median ${duration(workflow.duration.medianMs)}`,
                      }
                    : undefined
                }
              />
            ) : (
              <p className={styles.thin}>
                {noData
                  ? "No runs to plot."
                  : "Not enough first-attempt successes in the window to plot a trend."}
              </p>
            )}

            <div className={styles.conclusions}>
              {workflow.conclusions.map((entry) => (
                <span key={entry.conclusion} className={styles.conclusion}>
                  <span className={styles.conclusionCount}>{entry.count}</span>
                  {entry.conclusion}
                </span>
              ))}
            </div>

            {workflow.recentFailures.length > 0 && (
              <details className={styles.failures}>
                <summary>
                  {workflow.recentFailures.length} recent{" "}
                  {workflow.recentFailures.length === 1 ? "failure" : "failures"}
                </summary>
                <ul className={styles.failureList}>
                  {workflow.recentFailures.map((failure) => (
                    <li key={failure.id}>
                      <a href={failure.url} target="_blank" rel="noreferrer">
                        {dateTimeLabel(failure.startedAt)}
                      </a>
                      <span className={styles.failureMeta}>
                        {failure.conclusion}
                        {failure.attempt > 1 && ` · attempt ${failure.attempt}`}
                        {` · ${failure.event}`}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </Panel>
        );
      })}
    </>
  );
}
