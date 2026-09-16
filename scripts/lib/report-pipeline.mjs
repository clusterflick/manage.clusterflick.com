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

import { groupBy, londonDay, mean, percentile, rate, round } from "./stats.mjs";

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

export default function buildPipelineReport(targets, runsByKey, meta) {
  const workflows = targets.map((target) => {
    const collected = runsByKey[target.key] ?? [];
    // Guarded no-ops are dropped entirely rather than counted as fast
    // successes - see `guardJob` in lib/workflows.mjs. Reported alongside the
    // window so the run count on the page is never a silent subset.
    const runs = collected.filter((run) => !run.didNothing);
    const skippedNoOps = collected.length - runs.length;
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
      .filter((run) => run.conclusion !== "success" && run.conclusion !== "skipped")
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
          succeeded: dayRuns.filter((run) => run.conclusion === "success").length,
          failed: dayRuns.filter(
            (run) => run.conclusion !== "success" && run.conclusion !== "skipped",
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
      skippedNoOps,
      runs: runs.length,
      succeeded: succeeded.length,
      successRate: nothingCollected ? null : round(rate(succeeded.length, runs.length)),
      unassisted: target.unassisted && !nothingCollected ? firstAttemptSuccesses.length : null,
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
      recentFailures: failures.slice(0, 12).map((run) => ({
        id: run.id,
        startedAt: run.startedAt,
        conclusion: run.conclusion,
        attempt: run.attempt,
        event: run.event,
        title: run.displayTitle,
        url: run.url,
      })),
      lastRun: runs.length
        ? [...runs].sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]
        : null,
    };
  });

  return {
    windowDays: meta.windowDays,
    collectedAt: meta.collectedAt,
    workflows,
  };
}
