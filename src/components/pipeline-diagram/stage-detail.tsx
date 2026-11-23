"use client";

import Panel from "@/components/panel";
import { dateTimeLabel, duration, relativeTime, timeLabel } from "@/lib/format";
import {
  EVENT_LABEL,
  jobCounts,
  stageLook,
  TONE_ICON,
  type LiveJob,
  type LiveStage,
  type Tone,
} from "@/lib/pipeline-live";
import { shortJobName } from "@/app/pipeline/runner-groups";
import styles from "./stage-detail.module.scss";

type Props = { stage: LiveStage; now: number };

export default function StageDetail({ stage, now }: Props) {
  const run = stage.run;
  const { tone, label } = stageLook(stage);
  const counts = jobCounts(stage.jobs);

  return (
    <Panel
      title={
        <span className={styles.title}>
          {stage.name}
          <span className={`${styles.repo} mono`}>
            {stage.repo} · {stage.workflow}
          </span>
        </span>
      }
      note={
        run ? (
          <>
            Run {run.attempt > 1 && <>attempt {run.attempt} </>}started{" "}
            {dateTimeLabel(run.createdAt)},{" "}
            {EVENT_LABEL[run.event] ?? `by ${run.event}`}.
            {stage.usualMs !== null && (
              <>
                {" "}
                Recent successes took {duration(stage.usualMs)} from start to
                finish.
              </>
            )}
          </>
        ) : undefined
      }
      actions={
        <>
          {run && (
            <a href={run.url} target="_blank" rel="noreferrer">
              This run on GitHub ↗
            </a>
          )}
          <a href={stage.workflowUrl} target="_blank" rel="noreferrer">
            All runs ↗
          </a>
        </>
      }
      flush
    >
      <div className={styles.facts}>
        <Callout tone={tone} label={label}>
          {describe(stage, now)}
        </Callout>

        {stage.error && (
          <Callout tone="warning" label="Not read">
            The last sweep couldn&apos;t read this stage, so what&apos;s shown
            is from{" "}
            {stage.checkedAt
              ? relativeTime(stage.checkedAt, now)
              : "no sweep yet"}
            : <span className="mono">{stage.error}</span>
          </Callout>
        )}

        {stage.unconfirmed && (
          <Callout tone="warning" label="Unconfirmed">
            GitHub&apos;s run list answered with runs older than this one - it
            sometimes serves a stale index - so this run is the one seen before,
            asked after by id. A newer run may not be showing yet.
          </Callout>
        )}

        {stage.lastNoOpAt && (
          <p className={styles.aside}>
            Last dispatched with nothing to do{" "}
            {relativeTime(stage.lastNoOpAt, now)} ({timeLabel(stage.lastNoOpAt)}
            ): it builds one release a day, and today&apos;s was already made.
            Those runs are passed over here.
          </p>
        )}
      </div>

      {stage.jobs.length > 0 && (
        <div className={styles.scroll}>
          <table className={styles.jobs}>
            <caption className={styles.caption}>
              {counts.done} of {counts.total} jobs finished
              {counts.running > 0 && `, ${counts.running} running`}
              {counts.waiting > 0 && `, ${counts.waiting} waiting for a runner`}
              {counts.failed > 0 && `, ${counts.failed} failed`}
            </caption>
            <thead>
              <tr>
                <th scope="col">Job</th>
                <th scope="col">State</th>
                <th scope="col">Runner</th>
                <th scope="col" className={styles.number}>
                  Time
                </th>
              </tr>
            </thead>
            <tbody>
              {[...stage.jobs].sort(byInterest).map((job) => (
                <JobRow key={job.url} job={job} now={now} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function describe(stage: LiveStage, now: number) {
  const run = stage.run;
  if (stage.attention) return stage.attention;
  switch (stage.state) {
    case "running":
    case "queued": {
      const failed = jobCounts(stage.jobs).failed;
      return failed > 0 && stage.key === "retrieve"
        ? `Still going. ${failed} ${failed === 1 ? "job has" : "jobs have"} failed so far; the automatic re-run picks ${failed === 1 ? "it" : "them"} up once the run finishes.`
        : failed > 0
          ? `Still going, with ${failed} failed ${failed === 1 ? "job" : "jobs"} so far.`
          : "Still going, nothing failed so far.";
    }
    case "rerun-due":
      return stage.rerunDueAt && Date.parse(stage.rerunDueAt) > now
        ? `Failed, and its re-run workflow goes again at ${timeLabel(stage.rerunDueAt)} by itself - nothing to do yet.`
        : "Failed, and its re-run workflow is due to go again any moment - nothing to do yet.";
    case "succeeded":
      return run
        ? `Succeeded ${relativeTime(run.updatedAt, now)}.`
        : "Succeeded.";
    default:
      return "Nothing more to say about this one.";
  }
}

function Callout({
  tone,
  label,
  children,
}: {
  tone: Tone;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <p className={`${styles.callout} ${styles[tone]}`}>
      <span className={styles.calloutLabel}>
        <span aria-hidden="true">{TONE_ICON[tone]}</span> {label}
      </span>
      <span>{children}</span>
    </p>
  );
}

// Failures first, then what's running, then what's waiting, then the rest by
// name - the order a person looking for the problem reads in.
const RANK = (job: LiveJob) =>
  ["failure", "timed_out", "startup_failure"].includes(job.conclusion ?? "")
    ? 0
    : job.status === "in_progress"
      ? 1
      : job.waitingForRunner
        ? 2
        : 3;

const byInterest = (a: LiveJob, b: LiveJob) =>
  RANK(a) - RANK(b) || a.name.localeCompare(b.name);

function JobRow({ job, now }: { job: LiveJob; now: number }) {
  const rank = RANK(job);
  const tone: Tone =
    rank === 0
      ? "critical"
      : rank === 1
        ? "active"
        : rank === 2
          ? "idle"
          : job.conclusion === "success"
            ? "good"
            : job.conclusion === "skipped"
              ? "idle"
              : "serious";
  const state =
    rank === 0
      ? job.conclusion === "timed_out"
        ? "Timed out"
        : "Failed"
      : rank === 1
        ? "Running"
        : rank === 2
          ? "Waiting for a runner"
          : job.conclusion === "success"
            ? "Done"
            : job.conclusion === "skipped"
              ? "Skipped"
              : (job.conclusion ?? job.status);
  const time = job.waitingForRunner
    ? now - Date.parse(job.createdAt)
    : job.startedAt
      ? (job.completedAt ? Date.parse(job.completedAt) : now) -
        Date.parse(job.startedAt)
      : null;

  return (
    <tr>
      <td>
        <a href={job.url} target="_blank" rel="noreferrer">
          {shortJobName(job.name)}
        </a>
      </td>
      <td>
        <span className={`${styles.jobState} ${styles[tone]}`}>
          <span aria-hidden="true">{TONE_ICON[tone]}</span> {state}
        </span>
      </td>
      <td className={styles.runner}>
        {job.runner ?? (job.selfHosted ? "a self-hosted runner" : "—")}
      </td>
      <td className={styles.number}>
        {job.conclusion === "skipped" ? "—" : duration(time)}
      </td>
    </tr>
  );
}
