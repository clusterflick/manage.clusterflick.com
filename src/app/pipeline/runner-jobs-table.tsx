"use client";

import DataTable, { type Column } from "@/components/data-table";
import type { RunnerReport } from "@/lib/reports";
import { duration } from "@/lib/format";
import { groupLabel, ratioLabel } from "./runner-groups";
import styles from "./page.module.scss";

type Row = RunnerReport["jobs"][number];

// Each job's median duration before and after the change, per machine, and
// how many runs each median is over - a ratio from one run after is a hint,
// not a finding.
export default function RunnerJobsTable({ report }: { report: RunnerReport }) {
  const columns: Column<Row>[] = [
    {
      key: "job",
      header: "Job",
      sortValue: (row) => row.name,
      render: (row) => (
        <span className={styles.strong}>
          {row.name.replace(/^Retrieve /, "")}
        </span>
      ),
    },
    ...report.groups.flatMap(({ key }): Column<Row>[] => [
      {
        key: `${key}-before`,
        header: `${groupLabel(key)} before`,
        align: "right",
        sortValue: (row) => row.byGroup[key]?.beforeMs ?? -1,
        render: (row) => (
          <Median
            ms={row.byGroup[key]?.beforeMs}
            runs={row.byGroup[key]?.before}
          />
        ),
      },
      {
        key: `${key}-after`,
        header: `${groupLabel(key)} after`,
        align: "right",
        sortValue: (row) => row.byGroup[key]?.afterMs ?? -1,
        render: (row) => (
          <Median
            ms={row.byGroup[key]?.afterMs}
            runs={row.byGroup[key]?.after}
          />
        ),
      },
      {
        key: `${key}-ratio`,
        header: `${groupLabel(key)} change`,
        align: "right",
        sortValue: (row) => row.byGroup[key]?.ratio ?? -1,
        render: (row) => (
          <span className={styles.strong}>
            {ratioLabel(row.byGroup[key]?.ratio ?? null)}
          </span>
        ),
      },
    ]),
  ];

  return (
    <DataTable
      rows={report.jobs}
      columns={columns}
      rowKey={(row) => row.name}
      initialSort={{ key: "job", direction: "asc" }}
      pageSize={50}
    />
  );
}

function Median({ ms, runs }: { ms?: number | null; runs?: number }) {
  if (ms === null || ms === undefined) return <>—</>;
  return (
    <>
      {duration(ms)}
      <span className={styles.runs}> ({runs})</span>
    </>
  );
}
