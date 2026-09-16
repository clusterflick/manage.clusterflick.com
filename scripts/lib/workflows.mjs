// The workflows the stability report covers, in pipeline order.
//
// Its own module because both the fetch step and the report step need it, and
// importing it from the fetch script would run that script's download.
//
// `unassisted` marks the three with no auto-rerun workflow of their own, where
// `run_attempt > 1` can only mean a person clicked re-run - so the percentage
// means "finished first time, unaided". The others carry either a
// rerun-on-failure workflow or `cancel-in-progress`, which makes a later
// attempt say nothing about whether anyone was involved; they are reported on
// duration and conclusion alone. This mirrors the reasoning in
// data-analysed/scripts/workflow-run-stats.js, which writes the badges from
// the same API.
export const WORKFLOWS = [
  {
    key: "retrieve",
    name: "Retrieve",
    repo: "clusterflick/data-retrieved",
    workflow: "retrieve.yml",
    unassisted: true,
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
  },
  {
    key: "combine",
    name: "Combine",
    repo: "clusterflick/data-combined",
    workflow: "combine.yml",
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
  },
];

export default WORKFLOWS;
