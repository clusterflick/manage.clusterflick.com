// Thin GitHub REST helpers shared by the fetch step.
//
// Deliberately dependency-free (built-in fetch, Node 18+) so the workflow can
// run the data step before `npm ci` if it ever needs to, and so this matches
// the scripts in clusterflick/data-analysed that these downloads come from.

import { createWriteStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";

// Unauthenticated calls share a per-IP rate limit that CI runners and repeated
// local runs exhaust quickly, so send a token whenever one is available.
const TOKEN =
  process.env.PAT || process.env.GH_TOKEN || process.env.GITHUB_TOKEN || "";

const headers = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "clusterflick-manage-site",
  ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
};

export const hasToken = Boolean(TOKEN);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Retried with backoff because the run-jobs lookup makes one call per run -
// around 75 in a row for data-matched - and a single dropped connection there
// would fail the whole build. Retries on network errors and on the statuses
// that mean "ask again": 5xx, and the 403/429 GitHub uses for secondary rate
// limits. A 404 or a 401 is not going to improve on a second attempt.
const RETRYABLE = new Set([403, 429, 500, 502, 503, 504]);
const ATTEMPTS = 4;

// 2,000 runs. Far beyond any window this site asks for, and a hard stop on a
// pagination loop that could otherwise be steered by a bad `total_count`.
const MAX_RUN_PAGES = 20;

// How far before the reported window to ask the server for runs. See
// `listWorkflowRuns` - it covers re-runs whose original creation predates the
// window while the attempt that matters falls inside it.
const WINDOW_MARGIN_MS = 30 * 86400000;

export async function api(url, description) {
  let lastError;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, { headers });
      if (response.ok) return response.json();
      if (!RETRYABLE.has(response.status) || attempt === ATTEMPTS) {
        throw new Error(
          `GitHub returned ${response.status} ${response.statusText} for ${description}`,
        );
      }
      lastError = new Error(`${response.status} ${response.statusText}`);
    } catch (error) {
      // A thrown non-retryable response error is already final; anything else
      // here is a network failure, which is exactly what the retry is for.
      if (error.message?.startsWith("GitHub returned")) throw error;
      if (attempt === ATTEMPTS) {
        throw new Error(
          `Could not reach GitHub for ${description} after ${ATTEMPTS} attempts (${error.message})`,
        );
      }
      lastError = error;
    }
    await sleep(500 * 2 ** (attempt - 1));
  }
  throw lastError;
}

// Releases come back newest-first. `perPage` past 100 needs paging, which
// nothing here wants yet: the health window is days and the LLM log is months.
export async function listReleases(repo, perPage = 100) {
  return api(
    `https://api.github.com/repos/${repo}/releases?per_page=${perPage}`,
    `${repo} releases`,
  );
}

export async function latestRelease(repo) {
  return api(
    `https://api.github.com/repos/${repo}/releases/latest`,
    `${repo} latest release`,
  );
}

// Streamed rather than buffered: combined-data.json is ~17MB and moviedb-data
// is over 100MB, and holding those in memory alongside the parse that follows
// is the difference between a build that fits in a runner and one that doesn't.
export async function downloadAsset(asset, destination) {
  return downloadFile(asset.browser_download_url, destination, asset.name);
}

// Anything else served as a file: a workflow artifact's zip, or a source file
// from a repo. Artifact downloads redirect to storage on another origin, and
// fetch drops the Authorization header on that hop, which is what the storage
// side expects. The artifact endpoint answers 415 to an octet-stream Accept, so
// it passes the API's own media type instead.
export async function downloadFile(
  url,
  destination,
  description = url,
  { accept = "application/octet-stream" } = {},
) {
  await mkdir(path.dirname(destination), { recursive: true });
  // Retried like `api`: data-transformed alone is 422 downloads a build, and a
  // single 500 from release storage failed the whole thing.
  for (let attempt = 1; ; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { ...headers, Accept: accept } });
      if (response.ok && response.body) {
        await pipeline(Readable.fromWeb(response.body), createWriteStream(destination));
        return destination;
      }
      // Unread, the body holds its connection open through the retries.
      await response.body?.cancel();
      const error = new Error(
        `Could not download ${description}: ${response.status} ${response.statusText}`,
      );
      error.retryable = RETRYABLE.has(response.status);
      throw error;
    } catch (error) {
      // Network failures and interrupted streams carry no `retryable` flag and
      // are always worth another go; a 404 is not.
      if (error.retryable === false || attempt === ATTEMPTS) throw error;
    }
    await sleep(500 * 2 ** (attempt - 1));
  }
}

// Runs inside the window, completed ones only.
//
// The window is applied by the server through `created` rather than by pulling
// the newest 100 runs and filtering them here. Not just tidier: a workflow
// busier than a hundred runs a window - clusterflick.com is - was being
// silently truncated at whatever the first page happened to hold.
//
// `status=completed` is deliberately NOT sent, and status is filtered below
// instead. GitHub answers a status-filtered query out of the Actions search
// index, and when that index is behind it serves the stale contents as though
// they were current: a full page of runs, correctly ordered, 200 OK, with a
// `total_count` that agrees with the body, and nothing anywhere saying the
// answer is months old. Measured on data-retrieved/retrieve.yml, 40 calls per
// query shape, rotated so none held a fixed position:
//
//   status=completed   5 of 40 stale   (worst: newest run seven months back)
//   created=>=since    0 of 40
//   no filter at all   0 of 40
//
// Every stale answer held no run inside the window at all, which is how this
// site came to publish "Retrieve: 0 runs, 0% succeeded" for a flow that had run
// 68 times. GitHub's own account of it is that filtered searches read that
// index while unfiltered ones do not - see
// https://github.com/orgs/community/discussions/24626.
//
// `since` is widened before it is sent, and the caller's exact window is
// applied to `run_started_at` afterwards. The two are not the same field:
// `created` matches `created_at`, which stays at the moment a run was first
// created, while this site measures the window against `run_started_at`, which
// GitHub rewrites to the latest attempt when a run is re-run. A run created
// just before the cutoff and re-run just after it sits inside the window by the
// field we report on and outside it by the field the server filters on - so
// asking the server for exactly the window silently drops it. Seen on
// data-retrieved run 32065589286: created 20:24, re-run at 22:02, cutoff 21:10.
// Only ever re-runs, which are exactly the `attempt > 1` runs the unassisted
// figure is built from, so the bias is not neutral.
//
// A run still in progress has no conclusion and no duration, so counting one
// would either read as a failure or skew the average depending on which field
// you took.
export async function listWorkflowRuns(repo, workflow, { since, perPage = 100 } = {}) {
  // Doubling the window is the cheap end of the trade: a re-run triggered more
  // than a window after its original creation is dropped, which has not been
  // seen, and the cost is a page or two more per workflow. There is no exact
  // answer short of reading every run a workflow has ever had, because the API
  // can only bound on the field it orders by.
  const floor = since ? new Date(Date.parse(since) - WINDOW_MARGIN_MS).toISOString().replace(/\.\d+Z$/, "Z") : undefined;
  const collected = [];

  // Bounded rather than `while (true)`. A `total_count` that disagrees with the
  // pages under it is the exact failure this function exists to survive, and it
  // must not be able to turn into an endless loop.
  for (let page = 1; page <= MAX_RUN_PAGES; page += 1) {
    const query = new URLSearchParams({
      per_page: String(perPage),
      page: String(page),
      exclude_pull_requests: "true",
      ...(floor ? { created: `>=${floor}` } : {}),
    });
    const body = await api(
      `https://api.github.com/repos/${repo}/actions/workflows/${workflow}/runs?${query}`,
      `${repo} ${workflow} runs page ${page}`,
    );

    const batch = body.workflow_runs || [];
    collected.push(...batch);
    if (!batch.length) break;
    if (collected.length >= (body.total_count ?? collected.length)) break;
  }

  return collected.filter((run) => run.status === "completed");
}

export async function listRunJobs(repo, runId) {
  const body = await api(
    `https://api.github.com/repos/${repo}/actions/runs/${runId}/jobs?per_page=100`,
    `${repo} run ${runId} jobs`,
  );
  return body.jobs || [];
}

export async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(value));
  return file;
}

export async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

// One row per line; blank lines are skipped rather than parsed into `null`,
// which would read downstream as a run that reported nothing.
export function parseJsonl(contents, source) {
  return contents
    .split("\n")
    .map((line, index) => ({ line: line.trim(), index }))
    .filter(({ line }) => line.length > 0)
    .map(({ line, index }) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(
          `${source} line ${index + 1} is not JSON (${error.message})`,
        );
      }
    });
}
