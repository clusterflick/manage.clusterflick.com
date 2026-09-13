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
  await mkdir(path.dirname(destination), { recursive: true });
  const response = await fetch(asset.browser_download_url, {
    headers: { ...headers, Accept: "application/octet-stream" },
  });
  if (!response.ok || !response.body) {
    throw new Error(
      `Could not download ${asset.name}: ${response.status} ${response.statusText}`,
    );
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(destination));
  return destination;
}

// Completed runs only, and only as far back as the window needs. A run still in
// progress has no conclusion and no duration, so including it would either
// count as a failure or skew the average depending on which field you read.
export async function listWorkflowRuns(repo, workflow, { perPage = 100 } = {}) {
  const query = new URLSearchParams({
    per_page: String(perPage),
    status: "completed",
    exclude_pull_requests: "true",
  });
  const body = await api(
    `https://api.github.com/repos/${repo}/actions/workflows/${workflow}/runs?${query}`,
    `${repo} ${workflow} runs`,
  );
  return body.workflow_runs || [];
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
