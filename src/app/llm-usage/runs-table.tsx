"use client";

import { Fragment, useState } from "react";
import type { LlmDay, LlmReport } from "@/lib/reports";
import { compactCount, count, money, percent, timeLabel } from "@/lib/format";
import styles from "./page.module.scss";

type Run = LlmReport["runs"][number];

// A day's runs in the order they ran, each opening onto its split by provider.
// Hand-rolled rather than a DataTable: the order is the point, so nothing here
// sorts, and the day's total belongs in a footer the shared table doesn't have.
export default function RunsTable({
  runs,
  day,
  slots,
}: {
  runs: Run[];
  day: LlmDay;
  // Call-site colours, held to the ones the charts above use.
  slots: Record<string, number>;
}) {
  const [openRuns, setOpenRuns] = useState<Set<number>>(() => new Set());
  const dayCost = day.estimatedCostUsd;

  const toggleRun = (runId: number) =>
    setOpenRuns((current) => {
      const next = new Set(current);
      if (next.has(runId)) next.delete(runId);
      else next.add(runId);
      return next;
    });

  return (
    <div className={styles.scroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.toggleCol}>
              <span className="visually-hidden">Providers</span>
            </th>
            <th>Run</th>
            <th className={styles.right}>Calls</th>
            <th className={styles.right}>Cached</th>
            <th className={styles.right}>Prompt tokens</th>
            <th className={styles.right}>Cost</th>
            <th className={styles.right}>Share of day</th>
            <th className={styles.right}>Venues on LLM</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run, index) => {
            const canOpen = run.byProvider.length > 0;
            const isOpen = canOpen && openRuns.has(run.runId);
            return (
              <Fragment key={run.runId}>
                <tr className={isOpen ? styles.openRow : undefined}>
                  <td className={styles.toggleCol}>
                    {canOpen && (
                      <button
                        type="button"
                        className={styles.toggle}
                        onClick={() => toggleRun(run.runId)}
                        aria-expanded={isOpen}
                        aria-label={isOpen ? "Hide usage by provider" : "Show usage by provider"}
                      >
                        <span aria-hidden="true">{isOpen ? "▾" : "▸"}</span>
                      </button>
                    )}
                  </td>
                  <td className={styles.strong}>
                    {run.at ? timeLabel(run.at) : `Run ${index + 1}`}
                    {index === 0 && <span className={styles.tag}>cold cache</span>}
                  </td>
                  <td className={styles.right}>{count(run.calls)}</td>
                  <td className={styles.right}>{percent(run.cacheHitRate, 1)}</td>
                  <td className={styles.right}>{compactCount(run.promptTokens)}</td>
                  <td className={styles.right}>{money(run.estimatedCostUsd)}</td>
                  <td className={styles.right}>
                    {dayCost > 0 ? percent(run.estimatedCostUsd / dayCost, 0) : "—"}
                  </td>
                  <td className={styles.right}>
                    {count(run.venuesWithLlmUsage)} of {count(run.venueCount)}
                  </td>
                </tr>
                {isOpen && (
                  <tr className={styles.detailRow}>
                    <td colSpan={8}>
                      <ProviderBreakdown run={run} slots={slots} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td className={styles.toggleCol} />
            <td className={styles.strong}>
              {runs.length} {runs.length === 1 ? "run" : "runs"}
            </td>
            <td className={styles.right}>{count(day.calls)}</td>
            <td className={styles.right}>{percent(day.cacheHitRate, 1)}</td>
            <td className={styles.right}>{compactCount(day.promptTokens)}</td>
            <td className={styles.right}>{money(dayCost)}</td>
            <td className={styles.right}>100%</td>
            <td className={styles.right}>—</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// One row per provider the run called, with the call sites that make up its
// share. Tokens are only logged per run, not per call site, so they can't be
// split here.
function ProviderBreakdown({ run, slots }: { run: Run; slots: Record<string, number> }) {
  return (
    <table className={styles.providerTable}>
      <thead>
        <tr>
          <th>Provider</th>
          <th>Call sites</th>
          <th className={styles.right}>Calls</th>
          <th className={styles.right}>Cached</th>
          <th className={styles.right}>Cost</th>
          <th className={styles.right}>Share of run</th>
        </tr>
      </thead>
      <tbody>
        {run.byProvider.map((entry) => (
          <tr key={entry.provider}>
            <td className={styles.strong}>{entry.provider}</td>
            <td>
              <div className={styles.callSiteList}>
                {entry.callSites.map((site) => (
                  <span key={site.name} className={styles.callSiteChip}>
                    <span
                      className={styles.swatch}
                      style={{ background: `var(--series-${slots[site.name] ?? 8})` }}
                      aria-hidden="true"
                    />
                    <span className="mono">{site.name}</span>
                    <span className={styles.chipCount}>
                      {count(site.calls)} · {money(site.estimatedCostUsd)}
                    </span>
                  </span>
                ))}
              </div>
            </td>
            <td className={styles.right}>{count(entry.calls)}</td>
            <td className={styles.right}>{percent(entry.cacheHitRate, 1)}</td>
            <td className={styles.right}>{money(entry.estimatedCostUsd)}</td>
            <td className={styles.right}>
              {run.estimatedCostUsd > 0
                ? percent(entry.estimatedCostUsd / run.estimatedCostUsd, 0)
                : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
