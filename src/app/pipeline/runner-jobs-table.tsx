"use client";

import DataTable, { type Column } from "@/components/data-table";
import StatusPill from "@/components/status-pill";
import type { RunnerJob, RunnerReport } from "@/lib/reports";
import type { Severity } from "@/lib/status";
import { dateTimeLabel, duration } from "@/lib/format";
import { groupLabel, shortJobName } from "./runner-groups";
import styles from "./page.module.scss";

// How far past its usual time a run can go before it stops reading as in
// line. Jobs scrape live sites, so a quarter either way is ordinary; half again
// is worth a look. Faster than usual is never flagged.
const WARNING_OVER = 0.25;
const CRITICAL_OVER = 0.5;

const differenceOf = (job: RunnerJob) =>
  job.previous ? job.latest.ms / job.previous.meanMs - 1 : null;

function severityOf(difference: number): Severity {
  if (difference >= CRITICAL_OVER) return "critical";
  if (difference >= WARNING_OVER) return "warning";
  return "good";
}

const signed = (difference: number) =>
  `${difference >= 0 ? "+" : "−"}${Math.round(Math.abs(difference) * 100)}%`;

export default function RunnerJobsTable({ report }: { report: RunnerReport }) {
  const columns: Column<RunnerJob>[] = [
    {
      key: "job",
      header: "Job",
      sortValue: (job) => job.name,
      render: (job) => (
        <span className={styles.strong}>{shortJobName(job.name)}</span>
      ),
    },
    {
      key: "when",
      header: "Latest run",
      sortValue: (job) => job.latest.startedAt,
      render: (job) => (
        <a href={job.latest.runUrl} target="_blank" rel="noreferrer">
          {dateTimeLabel(job.latest.startedAt)}
        </a>
      ),
    },
    {
      key: "runner",
      header: "Runner",
      sortValue: (job) => job.latest.runner,
      render: (job) => (
        <span title={job.latest.runner}>{groupLabel(job.latest.group)}</span>
      ),
    },
    {
      key: "took",
      header: "Took",
      align: "right",
      sortValue: (job) => job.latest.ms,
      render: (job) => duration(job.latest.ms),
    },
    {
      key: "usual",
      header: `Previous ${report.previousRuns} there`,
      align: "right",
      sortValue: (job) => job.previous?.meanMs ?? -1,
      render: (job) =>
        job.previous ? (
          <>
            {duration(job.previous.meanMs)}
            {job.previous.runs < report.previousRuns && (
              <span className={styles.runs}> ({job.previous.runs} runs)</span>
            )}
          </>
        ) : (
          "—"
        ),
    },
    {
      key: "difference",
      header: "Difference",
      align: "right",
      sortValue: (job) => differenceOf(job) ?? -Infinity,
      render: (job) => {
        const difference = differenceOf(job);
        if (difference === null) return "—";
        return (
          <StatusPill severity={severityOf(difference)}>
            {signed(difference)}
          </StatusPill>
        );
      },
    },
  ];

  return (
    <DataTable
      rows={report.jobs}
      columns={columns}
      rowKey={(job) => job.name}
      initialSort={{ key: "difference", direction: "desc" }}
      pageSize={50}
    />
  );
}
