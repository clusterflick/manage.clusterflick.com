"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

// The live pipeline status, read in the browser from the api-pipeline Worker
// (clusterflick/api-pipeline), which sweeps GitHub Actions every two minutes.
// Everything else on this site is reduced at build time; this is the one thing
// that has to be current to be any use, and the Worker holds no secrets the
// browser would need - every repository it reads is public.

// Overridable for a local Worker (`npm run dev` there serves port 8791).
export const PIPELINE_STATUS_URL =
  process.env.NEXT_PUBLIC_PIPELINE_STATUS_URL ??
  "https://pipeline.clusterflick.com/status";

// The Worker caches /status for 30 seconds, and sweeps every two minutes.
const POLL_MS = 30_000;

// Past this, the Worker has missed several sweeps and the picture is old.
export const SWEEP_STALE_MS = 10 * 60 * 1000;

// The shape the Worker serves at `formatVersion` 1. Copied from
// api-pipeline's src/derive.ts and src/pipeline.ts, which document each
// field; a version this doesn't know is refused rather than misread.
export const FORMAT_VERSION = 1;

export type StageState =
  | "queued"
  | "running"
  | "succeeded"
  | "rerun-due"
  | "failed"
  | "cancelled"
  | "unknown";

export type LiveRun = {
  id: number;
  attempt: number;
  event: string;
  status: string;
  conclusion: string | null;
  createdAt: string;
  startedAt: string;
  updatedAt: string;
  url: string;
};

export type LiveJob = {
  name: string;
  status: string;
  conclusion: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  runner: string | null;
  selfHosted: boolean;
  waitingForRunner: boolean;
  url: string;
};

export type LiveStage = {
  key: string;
  name: string;
  repo: string;
  workflow: string;
  workflowUrl: string;
  next: string[];
  state: StageState;
  attention: string | null;
  run: LiveRun | null;
  jobs: LiveJob[];
  rerunDueAt: string | null;
  lastSuccessAt: string | null;
  stale: boolean;
  usualMs: number | null;
  lastNoOpAt: string | null;
  unconfirmed: boolean;
  error: string | null;
  checkedAt: string | null;
};

export type PipelineStatus = {
  formatVersion: number;
  sweptAt: string;
  state: "attention" | "running" | "idle";
  attention: { stage: string; message: string }[];
  rateLimit: { remaining: number; limit: number; resetAt: string } | null;
  stages: LiveStage[];
};

export type LiveResult =
  | { kind: "loading" }
  | { kind: "error"; message: string; last: PipelineStatus | null }
  | { kind: "ready"; status: PipelineStatus; fetchedAt: number };

// Polls the Worker while the tab is visible, and straight away when it comes
// back into view. A failed poll keeps the last good status alongside the
// error, so a blip doesn't blank the diagram - and says so.
export function usePipelineStatus(): LiveResult {
  const [result, setResult] = useState<LiveResult>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let last: PipelineStatus | null = null;

    async function poll() {
      clearTimeout(timer);
      try {
        const response = await fetch(PIPELINE_STATUS_URL, {
          cache: "no-store",
        });
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            body?.error ?? `The Worker answered ${response.status}`,
          );
        }
        if (body?.formatVersion !== FORMAT_VERSION) {
          throw new Error(
            `The Worker serves format version ${body?.formatVersion}, and this page reads ${FORMAT_VERSION}`,
          );
        }
        last = body as PipelineStatus;
        if (!cancelled) {
          setResult({ kind: "ready", status: last, fetchedAt: Date.now() });
        }
      } catch (error) {
        if (!cancelled) {
          setResult({
            kind: "error",
            message: error instanceof Error ? error.message : String(error),
            last,
          });
        }
      }
      if (!cancelled && document.visibilityState === "visible") {
        timer = setTimeout(poll, POLL_MS);
      }
    }

    function onVisibility() {
      if (document.visibilityState === "visible") poll();
      else clearTimeout(timer);
    }

    poll();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return result;
}

// A clock for elapsed times, ticking faster than RelativeTime's minute so a
// running stage's "12m in" doesn't sit still for a minute at a time. The same
// shape as RelativeTime's: one shared timer, and `null` until the page has
// hydrated, since the static HTML has no status to time.
const TICK_MS = 15_000;
let clock = Date.now();
const listeners = new Set<() => void>();
let ticker: ReturnType<typeof setInterval> | undefined;

function subscribeClock(listener: () => void) {
  listeners.add(listener);
  if (!ticker) {
    clock = Date.now();
    ticker = setInterval(() => {
      clock = Date.now();
      listeners.forEach((notify) => notify());
    }, TICK_MS);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      clearInterval(ticker);
      ticker = undefined;
    }
  };
}

export function useNow(): number | null {
  return useSyncExternalStore(
    subscribeClock,
    () => clock,
    () => null,
  );
}

// How a state reads on the diagram. `tone` picks the colour: the four status
// severities where the state is about health, and two of its own - `active`
// for work in progress and `idle` for work not yet started - since running is
// neither good nor bad. Every tone ships with an icon and a word.
export type Tone =
  "good" | "warning" | "serious" | "critical" | "active" | "idle";

export const TONE_ICON: Record<Tone, string> = {
  good: "●",
  warning: "▲",
  serious: "◆",
  critical: "■",
  active: "▶",
  idle: "○",
};

export function stageLook(stage: LiveStage): { tone: Tone; label: string } {
  if (stage.error && !stage.run) return { tone: "warning", label: "Not read" };
  switch (stage.state) {
    case "running":
      return { tone: "active", label: "Running" };
    case "queued":
      return {
        tone: "idle",
        label: stage.jobs.some((job) => job.waitingForRunner)
          ? "Waiting for a runner"
          : "Queued",
      };
    case "succeeded":
      return stage.stale
        ? { tone: "warning", label: "Stale" }
        : { tone: "good", label: "Done" };
    case "rerun-due":
      return { tone: "warning", label: "Re-run due" };
    case "failed":
      return { tone: "critical", label: "Failed" };
    case "cancelled":
      return { tone: "serious", label: "Cancelled" };
    default:
      return { tone: "warning", label: "Unknown" };
  }
}

// Work in flight, which the connector into the stage shows as flowing.
export const isActive = (stage: LiveStage | undefined) =>
  stage?.state === "running" || stage?.state === "queued";

export function jobCounts(jobs: LiveJob[]) {
  const done = jobs.filter((job) => job.status === "completed");
  return {
    total: jobs.length,
    done: done.length,
    failed: done.filter((job) =>
      ["failure", "timed_out", "startup_failure"].includes(
        job.conclusion ?? "",
      ),
    ).length,
    waiting: jobs.filter((job) => job.waitingForRunner).length,
    running: jobs.filter((job) => job.status === "in_progress").length,
  };
}

export const EVENT_LABEL: Record<string, string> = {
  workflow_dispatch: "started by hand or by the schedule",
  repository_dispatch: "dispatched by the stage before",
  schedule: "on its schedule",
  push: "by a push",
  workflow_run: "by another workflow",
};
