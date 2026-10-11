// How reliably the pipeline runs, workflow by workflow.
//
// Two questions, kept apart because they answer to different things:
//
//   Did it work?     - the conclusion of every completed run in the window.
//   Did it work
//   without help?    - `run_attempt === 1 && success`. Only meaningful on
//                      retrieve, transform and match: those three have no
//                      auto-rerun workflow, and the `nick-fields/retry`
//                      wrappers inside their jobs retry *within* a step, so
//                      `run_attempt` only ever goes past 1 because a person
//                      clicked re-run. The rest carry rerun-on-failure
//                      workflows or `cancel-in-progress`, where a later
//                      attempt says nothing about whether anyone was involved.
//
// Duration averages first-attempt successes only. GitHub rewrites
// `run_started_at` to the latest attempt when a run is re-run, so a retried
// run's elapsed time doesn't describe anything real - most of the gap is time
// spent waiting for someone to notice.
//
// And duration means *execution*, measured across the jobs that actually ran,
// not `updated_at - run_started_at`. That subtraction includes time queued for
// a runner: one data-diffed run waited 53 minutes and then built in 2m20s, and
// reporting 55 minutes as its build time says something false about the build.
// Queue wait is reported alongside, because it is worth knowing - it just
// answers a question about runner availability rather than about this flow.
//
// This mirrors the reasoning in data-analysed/scripts/workflow-run-stats.js,
// which writes the README badges from the same API. The site is the place that
// shows the runs behind the badge.

import {
  groupBy,
  londonDay,
  mean,
  median,
  percentile,
  rate,
  round,
} from "./stats.mjs";

// Bands for the unassisted percentage, chosen so that "needs a hand more than
// once a week" stops being green. Same thresholds as the badges.
const GOOD_PERCENT = 0.9;
const OK_PERCENT = 0.75;

export function statusFor(value) {
  if (value >= GOOD_PERCENT) return "good";
  if (value >= OK_PERCENT) return "warning";
  return "critical";
}

// `executionMs` is collected per run from its jobs. A run whose jobs all
// skipped has none, and is left out of the duration figures rather than
// counted as instantaneous.
const executionOf = (run) => run.executionMs;
const queueOf = (run) => run.queuedMs;

function spread(values) {
  const present = values.filter((value) => typeof value === "number");
  if (!present.length) {
    return { count: 0, meanMs: null, medianMs: null, p90Ms: null, maxMs: null };
  }
  return {
    count: present.length,
    meanMs: Math.round(mean(present)),
    medianMs: Math.round(percentile(present, 0.5)),
    p90Ms: Math.round(percentile(present, 0.9)),
    maxMs: Math.max(...present),
  };
}

// Runners are named per worker - self-hosted-macos-3, self-hosted-pi4-5 - and
// the workers on one machine share its network and its CPU, so they are read
// together. GitHub's own runners are numbered per job and have nothing in
// common with each other but being GitHub's.
export function runnerGroup(runner) {
  if (/^GitHub Actions \d+$/.test(runner)) return "github-hosted";
  return runner.replace(/^self-hosted-/, "").replace(/-\d+$/, "");
}

// How long a flow's jobs take, by the machine that ran them.
//
// Jobs differ by an order of magnitude - BFI takes two hours, Vue three
// minutes - and which machine picks up which job is down to which was free, so
// a raw average per machine mostly measures the job mix. Each job is measured
// against its own typical duration instead: its median across every runner in
// the window. A day's figure for a machine is the median of those ratios over
// the jobs it ran, so 1.3× reads as "jobs on this machine took 30% longer than
// usual that day" whatever the jobs were. Only jobs that ran on more than one
// machine count - one only ever run in one place has nothing to compare
// against, which rules out the GitHub-hosted release job.
function runnerReport(target, runs) {
  const executions = runs
    .flatMap((run) => run.jobs ?? [])
    .map((job) => ({ ...job, group: runnerGroup(job.runner) }));
  const byJob = groupBy(executions, (job) => job.name);
  const compared = [...byJob].filter(
    ([, jobs]) => new Set(jobs.map((job) => job.group)).size > 1,
  );
  if (!compared.length) return null;

  const typical = new Map(
    compared.map(([name, jobs]) => [name, median(jobs.map((job) => job.ms))]),
  );
  const measured = compared
    .flatMap(([, jobs]) => jobs)
    .map((job) => ({
      ...job,
      day: londonDay(job.startedAt),
      ratio: job.ms / typical.get(job.name),
    }));

  const groups = [...groupBy(measured, (job) => job.group)]
    .map(([key, jobs]) => ({
      key,
      runners: new Set(jobs.map((job) => job.runner)).size,
      jobs: jobs.length,
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
  const days = [...new Set(measured.map((job) => job.day))].sort();

  const daily = days.map((date) => {
    const onDay = measured.filter((job) => job.day === date);
    return {
      date,
      byGroup: Object.fromEntries(
        groups.map(({ key }) => {
          const ratios = onDay
            .filter((job) => job.group === key)
            .map((job) => job.ratio);
          return [key, ratios.length ? round(median(ratios), 3) : null];
        }),
      ),
    };
  });

  // Each job before and after the latest change inside the window, per
  // machine. Only a change with days on both sides of it says anything.
  const change =
    [...(target.runnerChanges ?? [])]
      .filter((entry) => entry.date > days[0] && entry.date <= days.at(-1))
      .sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
  const jobs = change
    ? compared
        .map(([name, jobRuns]) => ({
          name,
          byGroup: Object.fromEntries(
            groups.map(({ key }) => {
              const own = jobRuns.filter((job) => job.group === key);
              const before = own
                .filter((job) => londonDay(job.startedAt) < change.date)
                .map((job) => job.ms);
              const after = own
                .filter((job) => londonDay(job.startedAt) >= change.date)
                .map((job) => job.ms);
              const beforeMs = before.length ? median(before) : null;
              const afterMs = after.length ? median(after) : null;
              return [
                key,
                {
                  beforeMs,
                  afterMs,
                  before: before.length,
                  after: after.length,
                  ratio:
                    beforeMs && afterMs ? round(afterMs / beforeMs, 3) : null,
                },
              ];
            }),
          ),
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
    : [];

  // The typical job's change per machine: the median of the per-job ratios,
  // with the range beside it so one figure doesn't stand in for all of them.
  const summary = change
    ? groups.map(({ key }) => {
        const ratios = jobs
          .map((job) => job.byGroup[key].ratio)
          .filter((ratio) => ratio !== null);
        return {
          group: key,
          jobs: ratios.length,
          medianRatio: ratios.length ? round(median(ratios), 3) : null,
          minRatio: ratios.length ? round(Math.min(...ratios), 3) : null,
          maxRatio: ratios.length ? round(Math.max(...ratios), 3) : null,
        };
      })
    : [];

  return {
    groups,
    days: daily,
    changes: (target.runnerChanges ?? []).filter(
      (entry) => entry.date > days[0] && entry.date <= days.at(-1),
    ),
    change,
    jobs,
    summary,
  };
}

function withoutJobs(run) {
  const copy = { ...run };
  delete copy.jobs;
  return copy;
}

export default function buildPipelineReport(targets, runsByKey, meta) {
  const workflows = targets.map((target) => {
    const collected = runsByKey[target.key] ?? [];
    // Guarded no-ops are dropped entirely rather than counted as fast
    // successes - see `guardJob` in lib/workflows.mjs. Reported alongside the
    // window so the run count on the page is never a silent subset.
    const active = collected.filter((run) => !run.didNothing);
    const skippedNoOps = collected.length - active.length;
    // Superseded runs likewise - see `supersedesInFlight`. Only on flows that
    // cancel in flight: anywhere else a cancellation is a person or a timeout,
    // and that is worth counting against the flow.
    const runs = target.supersedesInFlight
      ? active.filter((run) => run.conclusion !== "cancelled")
      : active;
    const superseded = active.length - runs.length;
    // Nothing collected is not the same fact as nothing succeeded. `rate`
    // answers 0 for 0 of 0, and that zero rendered as "0% succeeded" in
    // critical red - a flow whose run history failed to come back reading as a
    // flow that failed every run. Every flow here runs at least daily, so an
    // empty window is a collection failure; the rates go null and the page
    // prints a dash. See `listWorkflowRuns` for what does the failing.
    const nothingCollected = runs.length === 0;
    const succeeded = runs.filter((run) => run.conclusion === "success");
    const firstAttemptSuccesses = succeeded.filter((run) => run.attempt === 1);

    const failures = runs
      .filter(
        (run) => run.conclusion !== "success" && run.conclusion !== "skipped",
      )
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));

    // Runs needing a person: either they ended badly, or they only succeeded on
    // a second attempt somebody triggered.
    const assisted = runs.filter(
      (run) => run.conclusion !== "success" || run.attempt > 1,
    );

    const byDay = [...groupBy(runs, (run) => londonDay(run.startedAt))]
      .map(([date, dayRuns]) => {
        const dayFirstAttempt = dayRuns.filter(
          (run) => run.conclusion === "success" && run.attempt === 1,
        );
        const dayExecutions = dayFirstAttempt
          .map(executionOf)
          .filter((ms) => typeof ms === "number");
        return {
          date,
          runs: dayRuns.length,
          succeeded: dayRuns.filter((run) => run.conclusion === "success")
            .length,
          failed: dayRuns.filter(
            (run) =>
              run.conclusion !== "success" && run.conclusion !== "skipped",
          ).length,
          medianDurationMs: dayExecutions.length
            ? Math.round(percentile(dayExecutions, 0.5))
            : null,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    const conclusions = [...groupBy(runs, (run) => run.conclusion ?? "unknown")]
      .map(([conclusion, group]) => ({ conclusion, count: group.length }))
      .sort((a, b) => b.count - a.count);

    return {
      key: target.key,
      name: target.name,
      repo: target.repo,
      workflow: target.workflow,
      // Said on the page rather than assumed: where this column is absent, it
      // is absent because it would not have meant anything.
      reportsUnassisted: Boolean(target.unassisted),
      unassistedGap: target.unassistedGap ?? null,
      skippedNoOps,
      superseded,
      runs: runs.length,
      succeeded: succeeded.length,
      successRate: nothingCollected
        ? null
        : round(rate(succeeded.length, runs.length)),
      unassisted:
        target.unassisted && !nothingCollected
          ? firstAttemptSuccesses.length
          : null,
      unassistedRate:
        target.unassisted && !nothingCollected
          ? round(rate(firstAttemptSuccesses.length, runs.length))
          : null,
      assistedRuns: assisted.length,
      // What the flow takes to run, jobs only.
      duration: spread(firstAttemptSuccesses.map(executionOf)),
      // How long runs waited for a runner. Taken over every completed run, not
      // just first-attempt successes: a run that queued for an hour and then
      // failed still waited an hour, and dropping it would hide exactly the
      // contention worth knowing about.
      queue: spread(runs.map(queueOf)),
      conclusions,
      byDay,
      // The per-run series the duration chart plots, oldest first.
      durationSeries: firstAttemptSuccesses
        .filter((run) => typeof run.executionMs === "number")
        .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
        .map((run) => ({
          id: run.id,
          startedAt: run.startedAt,
          durationMs: run.executionMs,
          queuedMs: run.queuedMs,
        })),
      byRunner: target.byRunner ? runnerReport(target, runs) : null,
      recentFailures: failures.slice(0, 12).map((run) => ({
        id: run.id,
        startedAt: run.startedAt,
        conclusion: run.conclusion,
        attempt: run.attempt,
        event: run.event,
        title: run.displayTitle,
        url: run.url,
      })),
      // Without its per-job durations, which the overview would otherwise
      // carry along for nothing.
      lastRun: runs.length
        ? withoutJobs(
            [...runs].sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0],
          )
        : null,
    };
  });

  return {
    windowDays: meta.windowDays,
    collectedAt: meta.collectedAt,
    workflows,
  };
}
