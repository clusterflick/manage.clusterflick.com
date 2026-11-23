"use client";

import { Fragment, useState } from "react";
import { duration, timeLabel } from "@/lib/format";
import {
  isActive,
  jobCounts,
  stageLook,
  TONE_ICON,
  type LiveStage,
  type PipelineStatus,
} from "@/lib/pipeline-live";
import StageDetail from "./stage-detail";
import styles from "./index.module.scss";

// The pipeline drawn as it runs:
//
//   retrieve → transform → diff → cache → combine ┬→ match ────┬→ website
//                                                 └→ calendar ─┘
//
// The shape is fixed here rather than laid out from each stage's `next`: it
// is the pipeline's, it changes when a repository is added, and a fixed
// layout keeps every stage in the same place from one visit to the next. A
// stage the Worker reports and this layout doesn't place is listed beneath,
// so a new one shows up rather than going missing.
const LINE = ["retrieve", "transform", "diff", "cache", "combine"];
const FORK = ["match", "calendar"];
const END = "website";
const PLACED = new Set([...LINE, ...FORK, END]);

type Props = {
  status: PipelineStatus;
  now: number;
};

export default function PipelineDiagram({ status, now }: Props) {
  const byKey = new Map(status.stages.map((stage) => [stage.key, stage]));
  const [selected, setSelected] = useState<string | null>(null);
  const shown = byKey.get(selected ?? "") ?? mostTelling(status.stages);
  const unplaced = status.stages.filter((stage) => !PLACED.has(stage.key));

  const card = (key: string, placement: string) => {
    const stage = byKey.get(key);
    if (!stage) return null;
    return (
      <StageCard
        key={key}
        stage={stage}
        now={now}
        placement={placement}
        selected={shown?.key === key}
        onSelect={() => setSelected(key)}
      />
    );
  };

  return (
    <>
      {/* One flat grid, so the fork can sit across two rows. The cards are in
          pipeline order in the markup, which is the order they're read in. */}
      <div className={styles.diagram}>
        {LINE.map((key, index) => (
          <Fragment key={key}>
            {index > 0 && (
              <Connector
                kind="line"
                flowing={[isActive(byKey.get(key))]}
                placement={`c${index}`}
              />
            )}
            {card(key, `s${index}`)}
          </Fragment>
        ))}
        <Connector
          kind="fork"
          flowing={FORK.map((key) => isActive(byKey.get(key)))}
          placement="cFork"
        />
        {card(FORK[0], "sForkA")}
        {card(FORK[1], "sForkB")}
        <Connector
          kind="merge"
          flowing={FORK.map(() => isActive(byKey.get(END)))}
          placement="cMerge"
        />
        {card(END, "sEnd")}
      </div>

      {unplaced.length > 0 && (
        <p className={styles.unplaced}>
          Also reported, and not yet placed on the diagram:{" "}
          {unplaced.map((stage, index) => (
            <span key={stage.key}>
              {index > 0 && ", "}
              <button
                type="button"
                className={styles.linkButton}
                onClick={() => setSelected(stage.key)}
              >
                {stage.name}
              </button>
            </span>
          ))}
        </p>
      )}

      {shown && <StageDetail stage={shown} now={now} />}
    </>
  );
}

// The stage worth opening with: the first needing a person, else the first
// in flight, else the last one, which says when the data last reached the
// site.
function mostTelling(stages: LiveStage[]) {
  return (
    stages.find((stage) => stage.attention || stage.error) ??
    stages.find((stage) => isActive(stage) || stage.state === "rerun-due") ??
    stages.at(-1)
  );
}

function StageCard({
  stage,
  now,
  placement,
  selected,
  onSelect,
}: {
  stage: LiveStage;
  now: number;
  placement: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const { tone, label } = stageLook(stage);
  const counts = jobCounts(stage.jobs);
  const run = stage.run;
  const going = run && run.status !== "completed";
  const elapsed = run ? now - Date.parse(run.createdAt) : null;
  const overdue =
    going &&
    stage.usualMs !== null &&
    elapsed !== null &&
    elapsed > stage.usualMs * 1.5;

  return (
    <button
      type="button"
      className={`${styles.card} ${styles[tone]} ${styles[placement]} ${
        selected ? styles.selected : ""
      } ${stage.error ? styles.unread : ""}`}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className={styles.cardHead}>
        <span className={styles.name}>{stage.name}</span>
        <span className={styles.pill}>
          <span aria-hidden="true" className={styles.icon}>
            {TONE_ICON[tone]}
          </span>
          {label}
        </span>
      </span>

      <span className={styles.lines}>
        {going && elapsed !== null && (
          <>
            <span>
              {duration(elapsed)} in
              {stage.usualMs !== null && (
                <span className={styles.dim}>
                  {" "}
                  · usually {duration(stage.usualMs)}
                </span>
              )}
            </span>
            {stage.usualMs !== null && (
              <span
                className={`${styles.progress} ${overdue ? styles.overdue : ""}`}
                aria-hidden="true"
              >
                <span
                  style={{
                    width: `${Math.min(100, (elapsed / stage.usualMs) * 100)}%`,
                  }}
                />
              </span>
            )}
          </>
        )}

        {stage.state === "rerun-due" && stage.rerunDueAt && (
          <span>
            Re-runs{" "}
            {Date.parse(stage.rerunDueAt) > now
              ? `at ${timeLabel(stage.rerunDueAt)}`
              : "any moment"}
          </span>
        )}

        {run && run.status === "completed" && stage.state !== "rerun-due" && (
          <span className={styles.dim}>
            {stage.state === "succeeded" ? "Finished" : "Ended"}{" "}
            {timeLabel(run.updatedAt)}
            {stage.state === "succeeded" &&
              ` · took ${duration(Date.parse(run.updatedAt) - Date.parse(run.createdAt))}`}
          </span>
        )}

        {counts.total > 1 && (going || counts.failed > 0) && (
          <span className={styles.dim}>
            {counts.done} of {counts.total} jobs
            {counts.failed > 0 && (
              <span className={styles.failedCount}>
                {" "}
                · {counts.failed} failed
              </span>
            )}
            {counts.waiting > 0 && ` · ${counts.waiting} waiting`}
          </span>
        )}

        {stage.error && (
          <span className={styles.warnLine}>Couldn&apos;t be read</span>
        )}
        {!run && !stage.error && (
          <span className={styles.dim}>No runs listed</span>
        )}
        {run && run.attempt > 1 && (
          <span className={styles.dim}>Attempt {run.attempt}</span>
        )}
      </span>
    </button>
  );
}

// The arrow into a stage, or the split after Combine and the join before the
// website. Drawn twice, across and down, and the stylesheet shows the one the
// layout needs. A branch carrying work into a running stage moves.
function Connector({
  kind,
  flowing,
  placement,
}: {
  kind: "line" | "fork" | "merge";
  flowing: boolean[];
  placement: string;
}) {
  const across =
    kind === "line"
      ? ["M0 50 H100"]
      : kind === "fork"
        ? ["M0 50 H40 C70 50 70 25 100 25", "M0 50 H40 C70 50 70 75 100 75"]
        : ["M0 25 C30 25 30 50 60 50 H100", "M0 75 C30 75 30 50 60 50 H100"];
  const down =
    kind === "line"
      ? ["M50 0 V100"]
      : kind === "fork"
        ? ["M50 0 V40 C50 70 25 70 25 100", "M50 0 V40 C50 70 75 70 75 100"]
        : ["M25 0 C25 30 50 30 50 60 V100", "M75 0 C75 30 50 30 50 60 V100"];

  const paths = (list: string[]) =>
    list.map((d, index) => (
      <path
        key={d}
        d={d}
        vectorEffect="non-scaling-stroke"
        className={flowing[index] ? styles.flowing : undefined}
      />
    ));

  return (
    <span
      className={`${styles.connector} ${styles[placement]}`}
      aria-hidden="true"
    >
      <svg
        className={styles.across}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        {paths(across)}
      </svg>
      <svg
        className={styles.down}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        {paths(down)}
      </svg>
    </span>
  );
}
