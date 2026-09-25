# manage.clusterflick.com

An internal review site for the Clusterflick pipeline. It answers four questions
in one place:

- **Catalogue** — what is in the current data, what failed to match, what the
  matches are missing, and which listings flap from one run to the next.
- **LLM usage** — what the transform pipeline spends on the LLM, and where it goes.
- **Pipeline** — how reliably retrieve, transform, match and the rest actually run.
- **Venues** — which sources have stopped answering, and why.

The overview page puts the headline figure from each on one screen.

## How it gets its data

Everything is fetched and reduced at build time, and the site is a static export
— no tokens in the browser, and nothing to run.

```
npm ci
npm run prepare-data   # fetch-source-data + build-report
npm run dev
```

| Step | What it does |
| --- | --- |
| `npm run fetch-source-data` | Downloads into `./source-data`: the latest `data-combined` (and the listings from each of its recent releases), `data-matched` and `data-transformed` releases, the title normaliser from `clusterflick/scripts`, the monthly LLM usage logs and daily venue health logs from `data-analysed`, the latest transform run's per-venue LLM usage artifacts, and the workflow run history for every pipeline repo. |
| `npm run build-report` | Reduces those into one JSON file per page under `src/generated`. |
| `npm run build` | Static export into `./out`. |

Both directories are git-ignored — the reports are derived, and regenerating them
is a command rather than a commit. `prepare-data` must run before `build`, `dev`
or `lint`, because the pages import the generated JSON directly.

Useful environment variables for the fetch step:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PAT` / `GH_TOKEN` / `GITHUB_TOKEN` | — | Raises the API rate limit. Every repo read is public, so this is optional; without one you just run out of budget sooner. |
| `SKIP_EXISTING` | `false` | Reuse anything already in `./source-data`. What you want while working on the reports themselves. |
| `HEALTH_DAYS` | `14` | How many daily venue-health releases to pull. |
| `LLM_MONTHS` | `6` | How many monthly LLM usage releases to pull. |
| `RUN_WINDOW_DAYS` | `30` | How far back to read workflow runs. |
| `FLAP_RELEASES` | `30` | How many `data-combined` releases to compare when looking for flapping listings — about ten days. |

## Deployment

`generate_site.yml` builds and deploys to GitHub Pages on a `release_event`
dispatch, on a `venue_health` dispatch sent by `data-analysed` after each hourly
health cycle, on every push to `main`, and nightly. The nightly run matters: the
run history, the usage log and the health log all move on their own schedules, so
a site that only rebuilt on a data release would show a stale pipeline page on
exactly the day the pipeline was too broken to publish one. The push trigger is
what publishes a change to the site itself — the data dispatch only fires when
the data moves, so without it a merge waited for the next nightly run.

Job timings for finished runs are kept in `./.cache` between builds (restored by
`actions/cache` in CI), so an hourly rebuild looks up only the runs it has not
seen rather than making ~600 jobs calls against the token's rate limit.

Flapping is found by following each venue listing through the recent
`data-combined` releases. Each release is around 20MB, and all that matters here
is which film every listing sat under, so each is reduced to that (around 550KB)
and kept in `./.cache/combined-history` by tag. Releases never change once
published, so a rebuild downloads only the ones it hasn't seen.

The per-venue LLM breakdown comes from workflow artifacts, which need a token to
download and expire after a fortnight. Without one, the LLM page says so in
place of the table.

## Figures that are easy to misread

Three numbers on this site would say the wrong thing if taken at face value, and
the pages that carry them say so too:

- **Match rate** counts *film listings only*, and treats a listing that resolved
  into its parts as a match. 454 of 1,840 entries carry `isUnmatched`, but most
  are shorts programmes, Q&As, quiz nights and gigs — listings with no film to
  match to. And `isUnmatched` is not the same as unmatched: a double bill has no
  single film to resolve to, so the wrapper carries the flag while the match sits
  in `includedMovies`, a list of fully resolved films with their own TMDB ids and
  posters. 106 listings are matched that way. Reading the flag alone gives 91.7%;
  counting properly gives **94.8%**, with **79** genuine misses rather than 126.
- **Run duration** is execution time across the jobs that actually ran, not
  `updated_at - run_started_at`. That subtraction includes time queued for a
  runner — one `data-diffed` run waited 53 minutes and then built in 2m20s, and
  GitHub's own `run_duration_ms` calls that a 55-minute run. Queue wait is
  reported alongside, because runner contention is worth seeing; it just is not a
  fact about the build.
- **Unassisted run rate** is only meaningful for retrieve, transform and match.
  Those three have no auto-rerun workflow, so `run_attempt > 1` can only mean a
  person clicked re-run. The rest carry a rerun-on-failure workflow or
  `cancel-in-progress`, where a later attempt says nothing about whether anyone
  was involved. It is left blank there rather than computed.
- **Venues with no listings** is split by `programming`. Of 414 venues, 268 are
  occasional hosts — community centres, pubs, parks — which are empty almost all
  of the time by their nature. Only a silent *cinema* means something is wrong.

The run history is also read a particular way, because the obvious way returns
wrong answers. GitHub's workflow-runs endpoint answers a `status`-filtered query
out of the Actions search index, and when that index is behind it serves the
stale contents as though they were current — a full page of runs, correctly
ordered, `200 OK`, with a `total_count` that agrees with the body, and nothing
saying the answer is months old. Measured on `data-retrieved/retrieve.yml`, 40
calls per query shape: **5 of 40 stale with `status=completed`, 0 of 40 with the
`created` form, 0 of 40 unfiltered**. Every stale answer held no run inside the
window, which is how this site once published "Retrieve: 0 runs, 0% succeeded"
for a flow that had run 68 times. So the window goes to the server as `created`,
the pages are followed to `total_count` rather than to the first short page, and
the status is filtered here off a field every run already carries. A flow that
still comes back empty is reported as missing rather than as zero — every flow
here runs at least daily, so an empty window is the history failing to arrive.
See [community discussion #24626](https://github.com/orgs/community/discussions/24626).

`match` runs are also filtered: the flow is dispatched by every `data-combined`
release but only builds once a day, and the runs where its opening guard skipped
everything finish in seconds having done nothing. Averaging those in reported a
median build time of about nine seconds against a real one of three and a half
hours.

## Related

The badges in `clusterflick/data-analysed` are generated from the same GitHub API
and the same reasoning (`scripts/workflow-run-stats.js`, `scripts/append-llm-usage-log.js`,
`scripts/analyse-health-log.js`). This site is where the runs behind a badge can
actually be looked at.
