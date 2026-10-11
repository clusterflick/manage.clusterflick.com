import { Fragment } from "react";
import Panel from "@/components/panel";
import PageHeader from "@/components/page-header";
import StatusPill from "@/components/status-pill";
import LineChart from "@/components/charts/line-chart";
import { pipeline, type RunnerJob, type RunnerReport } from "@/lib/reports";
import { rateStatus } from "@/lib/status";
import {
  count,
  dateLabel,
  dateTimeLabel,
  duration,
  percent,
} from "@/lib/format";
import RunnerJobsTable from "./runner-jobs-table";
import { groupLabel, groupSlot, shortJobName } from "./runner-groups";
import styles from "./page.module.scss";

export const metadata = { title: "Pipeline — Clusterflick manage" };

export default function PipelinePage() {
  return (
    <>
      <PageHeader
        title="Pipeline stability"
        meta={
          <>
            Last {pipeline.windowDays} days, collected{" "}
            {dateTimeLabel(pipeline.collectedAt)}. Durations are execution time
            over first-attempt successes, queue time excluded.
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
          <Fragment key={workflow.key}>
            <Panel
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
                    No run history came back for this flow. Every flow here runs
                    at least daily, so these figures are missing rather than
                    zero — GitHub&apos;s run list intermittently answers from a
                    stale index, months behind and with nothing in the response
                    to say so. Rebuilding usually clears it.
                  </>
                ) : workflow.skippedNoOps > 0 ? (
                  <>
                    {count(workflow.skippedNoOps)} runs are excluded: this flow
                    opens with a &ldquo;have we already released today?&rdquo;
                    job, and when it has, every other job is skipped. Those runs
                    finish in seconds having done nothing, and counting them
                    would report a build time of about nine seconds.
                  </>
                ) : workflow.superseded > 0 ? (
                  <>
                    {count(workflow.superseded)} cancelled runs are excluded:
                    this flow cancels a build in flight when newer data arrives,
                    so those runs were replaced by a later build rather than
                    failing.
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
                  {workflow.reportsUnassisted &&
                    workflow.unassistedRate !== null && (
                      <StatusPill
                        severity={rateStatus(workflow.unassistedRate)}
                      >
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
                      <a
                        href={workflow.lastRun.url}
                        target="_blank"
                        rel="noreferrer"
                      >
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
                    <span className={styles.conclusionCount}>
                      {entry.count}
                    </span>
                    {entry.conclusion}
                  </span>
                ))}
              </div>

              {workflow.recentFailures.length > 0 && (
                <details className={styles.failures}>
                  <summary>
                    {workflow.recentFailures.length} recent{" "}
                    {workflow.recentFailures.length === 1
                      ? "failure"
                      : "failures"}
                  </summary>
                  <ul className={styles.failureList}>
                    {workflow.recentFailures.map((failure) => (
                      <li key={failure.id}>
                        <a href={failure.url} target="_blank" rel="noreferrer">
                          {dateTimeLabel(failure.startedAt)}
                        </a>
                        <span className={styles.failureMeta}>
                          {failure.conclusion}
                          {failure.attempt > 1 &&
                            ` · attempt ${failure.attempt}`}
                          {` · ${failure.event}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </Panel>
            {workflow.byRunner && (
              <RunnerPanel name={workflow.name} report={workflow.byRunner} />
            )}
          </Fragment>
        );
      })}
    </>
  );
}

// How long each of a flow's jobs takes on each machine. Run duration can't
// show this: a run lasts as long as its slowest job, and re-run runs are left
// out of it altogether, where a job that succeeded is a clean measurement
// whichever attempt it was in.
//
// One small chart per job rather than one chart of all of them: jobs run from
// three minutes to two hours, and fourteen jobs on two machines is more lines
// than anyone can follow. Each chart gets its own axis, and each machine the
// same colour in all of them.
// Slowest first: those are the jobs a run waits on.
function byTypicalDuration(jobs: RunnerJob[]) {
  const typical = (job: RunnerJob) => job.previous?.meanMs ?? job.latest.ms;
  return [...jobs].sort((a, b) => typical(b) - typical(a));
}

function RunnerPanel({ name, report }: { name: string; report: RunnerReport }) {
  const labels = report.days.map((day) => dateLabel(day));
  return (
    <Panel
      id="runners"
      title={`${name} jobs by runner`}
      note={
        <>
          Each job&apos;s median duration per day on each machine, from its
          successful runs in every attempt, slowest job first. A line runs on
          across days a machine didn&apos;t pick the job up; the dots are the
          days it did. Below, each job&apos;s latest run against the mean of the{" "}
          {report.previousRuns} before it on the same machine.
        </>
      }
    >
      <ul className={styles.runnerLegend}>
        {report.groups.map((group) => (
          <li key={group.key}>
            <span
              className={styles.swatch}
              style={{ background: `var(--series-${groupSlot(group.key)})` }}
              aria-hidden="true"
            />
            {groupLabel(group.key)}
            {/* GitHub's runners are fresh for every job, so a count of them
                says nothing. */}
            {group.key !== "github-hosted" && (
              <span className={styles.runs}>
                {" "}
                · {group.runners} {group.runners === 1 ? "runner" : "runners"}
              </span>
            )}
          </li>
        ))}
      </ul>

      <div className={styles.jobCharts}>
        {byTypicalDuration(report.jobs).map((job) => (
          <figure key={job.name} className={styles.jobChart}>
            <figcaption className={styles.jobChartTitle}>
              {shortJobName(job.name)}
            </figcaption>
            <LineChart
              series={Object.entries(job.daily).map(([group, values]) => ({
                key: group,
                label: groupLabel(group),
                values,
                slot: groupSlot(group),
                joinGaps: true,
              }))}
              labels={labels}
              format="duration"
              width={340}
              height={150}
              legend={false}
            />
          </figure>
        ))}
      </div>

      <div className={styles.runnerTable}>
        <RunnerJobsTable report={report} />
      </div>
    </Panel>
  );
}
