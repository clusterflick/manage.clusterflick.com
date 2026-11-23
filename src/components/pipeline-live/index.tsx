"use client";

import Link from "next/link";
import PipelineDiagram from "@/components/pipeline-diagram";
import { relativeTime } from "@/lib/format";
import {
  PIPELINE_STATUS_URL,
  SWEEP_STALE_MS,
  TONE_ICON,
  usePipelineStatus,
  useNow,
  type PipelineStatus,
  type Tone,
} from "@/lib/pipeline-live";
import styles from "./index.module.scss";

const OVERALL: Record<PipelineStatus["state"], { tone: Tone; label: string }> =
  {
    attention: { tone: "critical", label: "Needs attention" },
    running: { tone: "active", label: "Running" },
    idle: { tone: "good", label: "All done" },
  };

// The whole live view: what the pipeline is doing, then the diagram.
export default function PipelineLive() {
  const result = usePipelineStatus();
  const now = useNow();

  if (result.kind === "loading" || now === null) {
    return <p className={styles.waiting}>Asking the pipeline Worker…</p>;
  }

  const status = result.kind === "ready" ? result.status : result.last;

  return (
    <>
      {result.kind === "error" && (
        <p className={`${styles.banner} ${styles.critical}`} role="alert">
          <strong>Couldn&apos;t reach the pipeline Worker.</strong>{" "}
          {status
            ? "Showing what it last said, which may be out of date. "
            : ""}
          <span className={styles.detail}>
            {result.message} (
            <span className="mono">{PIPELINE_STATUS_URL}</span>
            ). Trying again every 30 seconds.
          </span>
        </p>
      )}
      {status && <Live status={status} now={now} />}
    </>
  );
}

function Live({ status, now }: { status: PipelineStatus; now: number }) {
  const overall = OVERALL[status.state];
  const sweptAgo = now - Date.parse(status.sweptAt);
  const names = new Map(status.stages.map((stage) => [stage.key, stage.name]));

  return (
    <>
      <div className={`${styles.summary} ${styles[overall.tone]}`}>
        <span className={styles.overall}>
          <span aria-hidden="true">{TONE_ICON[overall.tone]}</span>{" "}
          {overall.label}
        </span>
        <span className={styles.swept}>
          Checked {relativeTime(status.sweptAt, now)}, every two minutes
          {status.rateLimit && (
            <>
              {" "}
              · {status.rateLimit.remaining.toLocaleString("en-GB")} of{" "}
              {status.rateLimit.limit.toLocaleString("en-GB")} GitHub requests
              left this hour
            </>
          )}
        </span>
      </div>

      {sweptAgo > SWEEP_STALE_MS && (
        <p className={`${styles.banner} ${styles.warning}`}>
          <strong>
            The Worker hasn&apos;t swept for{" "}
            {relativeTime(status.sweptAt, now).replace(" ago", "")}.
          </strong>{" "}
          It sweeps every two minutes, so it has stopped: this is how the
          pipeline looked then, not now.
        </p>
      )}

      {status.attention.length > 0 && (
        <ul className={styles.attention}>
          {status.attention.map(({ stage, message }) => (
            <li key={stage}>
              <strong>{names.get(stage) ?? stage}:</strong> {message}
            </li>
          ))}
        </ul>
      )}

      <PipelineDiagram status={status} now={now} />
    </>
  );
}

// One line for the overview, linking to the live page.
export function PipelineStrip() {
  const result = usePipelineStatus();
  const now = useNow();
  const status =
    result.kind === "ready"
      ? result.status
      : result.kind === "error"
        ? result.last
        : null;

  if (!status || now === null) {
    return (
      <p className={styles.strip}>
        <Link href="/live">Live pipeline</Link>
        <span className={styles.detail}>
          {result.kind === "error"
            ? ` - couldn't reach the Worker: ${result.message}`
            : " - checking…"}
        </span>
      </p>
    );
  }

  const overall = OVERALL[status.state];
  const busy = status.stages.filter(
    (stage) => stage.state === "running" || stage.state === "queued",
  );
  const stale = now - Date.parse(status.sweptAt) > SWEEP_STALE_MS;

  return (
    <p
      className={`${styles.strip} ${styles[stale ? "warning" : overall.tone]}`}
    >
      <span className={styles.overall}>
        <span aria-hidden="true">
          {TONE_ICON[stale ? "warning" : overall.tone]}
        </span>{" "}
        {stale ? "Not current" : overall.label}
      </span>
      <span className={styles.detail}>
        {status.attention.length > 0
          ? `${status.attention.length} ${status.attention.length === 1 ? "stage needs" : "stages need"} a look`
          : busy.length > 0
            ? `${busy.map((stage) => stage.name).join(", ")} in progress`
            : "Nothing running"}
        {" · "}checked {relativeTime(status.sweptAt, now)}
      </span>
      <Link href="/live">Live pipeline →</Link>
    </p>
  );
}
