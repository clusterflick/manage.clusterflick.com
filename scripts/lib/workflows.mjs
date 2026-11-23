// The workflows the stability report covers, in pipeline order.
//
// Its own module because both the fetch step and the report step need it, and
// importing it from the fetch script would run that script's download.
//
// `unassisted` marks the three where the percentage means "finished without a
// person". On transform and match `run_attempt > 1` can only mean a person
// clicked re-run. Retrieve has an automatic re-run (`autoRerun`, below), whose
// attempt is told from a person's by who started it. The others carry either a
// rerun-on-failure workflow or `cancel-in-progress`, which makes a later
// attempt say nothing about whether anyone was involved; they are reported on
// duration and conclusion alone, and `unassistedGap` is the short reason the
// pages print in the column instead. This mirrors the reasoning in
// data-analysed/scripts/workflow-run-stats.js, which writes the badges from
// the same API.
export const WORKFLOWS = [
  {
    key: "retrieve",
    name: "Retrieve",
    repo: "clusterflick/data-retrieved",
    workflow: "retrieve.yml",
    unassisted: true,
    // data-retrieved's rerun-failed-retrieve.yml re-runs a failed run's failed
    // jobs once, as attempt 2, ten minutes after the last of them finished. It
    // runs with `github.token`, so that attempt's `triggering_actor` is the
    // bot, where a re-run someone clicked names them. A run that succeeded on
    // it needed no one: it counts as unassisted, and its time to release -
    // attempt 1's start to the run's end - is reported on its own.
    autoRerun: { attempt: 2, actor: "github-actions[bot]" },
    // Retrieve is the one flow on self-hosted runners - a machine with four
    // macOS workers, six Raspberry Pis and the OptiPlexes - so how long its
    // jobs take depends on which machine picked them up. Each successful job's
    // duration and runner are kept, so a change on one machine shows against
    // the others.
    byRunner: true,
  },
  {
    key: "transform",
    name: "Transform",
    repo: "clusterflick/data-transformed",
    workflow: "transform.yml",
    unassisted: true,
  },
  {
    key: "diff",
    name: "Diff",
    repo: "clusterflick/data-diffed",
    workflow: "diff.yml",
    unassistedGap: "auto-reruns",
  },
  {
    key: "combine",
    name: "Combine",
    repo: "clusterflick/data-combined",
    workflow: "combine.yml",
    unassistedGap: "auto-reruns",
  },
  {
    key: "match",
    name: "Match",
    repo: "clusterflick/data-matched",
    workflow: "match.yml",
    unassisted: true,
    // data-matched is dispatched by every data-combined release but only builds
    // one release a day: its first job looks for today's release and, when
    // there is one, every other job is skipped. Those runs finish in seconds
    // having done nothing - 44 of the last 74 - so averaging them in would
    // report a median build time of about nine seconds. Runs where this job
    // succeeded and everything after it skipped are dropped from the window.
    guardJob: "Check if release already created today",
  },
  {
    key: "calendar",
    name: "Calendar",
    repo: "clusterflick/data-calendar",
    workflow: "generate_calendar.yml",
    unassistedGap: "auto-reruns",
  },
  {
    key: "website",
    name: "Website",
    repo: "clusterflick/clusterflick.com",
    workflow: "generate_site.yml",
    // `cancel-in-progress: true` on a single concurrency group, so every
    // data-combined release that lands mid-build cancels the build in flight
    // and starts a fresh one. Those cancellations are the flow working as
    // designed - the newer run publishes the newer data - and counting them as
    // failures reported 17 superseded builds as 17 failed ones. They are
    // dropped from the window instead, and counted on the page.
    supersedesInFlight: true,
    unassistedGap: "cancels in flight",
  },
];

export default WORKFLOWS;
