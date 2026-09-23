"use client";

import DataTable, { type Column } from "@/components/data-table";
import type { LlmVenueUsage } from "@/lib/reports";
import { compactCount, count, money, percent } from "@/lib/format";
import styles from "./page.module.scss";

export default function VenueUsageTable({
  venues,
  slots,
}: {
  venues: LlmVenueUsage[];
  // Call-site colours, held to the ones the charts above use.
  slots: Record<string, number>;
}) {
  const columns: Column<LlmVenueUsage>[] = [
    {
      key: "venue",
      header: "Venue",
      sortValue: (venue) => venue.venueId,
      render: (venue) => <span className={`${styles.strong} mono`}>{venue.venueId}</span>,
    },
    {
      key: "callSites",
      header: "Needed",
      render: (venue) => (
        <div className={styles.callSiteList}>
          {venue.callSites.map((site) => (
            <span key={site.name} className={styles.callSiteChip}>
              <span
                className={styles.swatch}
                style={{ background: `var(--series-${slots[site.name] ?? 8})` }}
                aria-hidden="true"
              />
              <span className="mono">{site.name}</span>
              <span className={styles.chipCount}>
                {count(site.calls)}
                {site.cacheMisses > 0 && ` · ${count(site.cacheMisses)} uncached`}
              </span>
            </span>
          ))}
        </div>
      ),
    },
    {
      key: "calls",
      header: "Calls",
      align: "right",
      width: "80px",
      sortValue: (venue) => venue.calls,
      render: (venue) => count(venue.calls),
    },
    {
      key: "hitRate",
      header: "Cached",
      align: "right",
      width: "90px",
      sortValue: (venue) => venue.cacheHitRate,
      render: (venue) => percent(venue.cacheHitRate, 0),
    },
    {
      key: "prompt",
      header: "Largest prompt",
      align: "right",
      width: "120px",
      sortValue: (venue) => venue.maxPromptChars,
      render: (venue) => `${compactCount(venue.maxPromptChars)} chars`,
    },
    {
      key: "cost",
      header: "Cost",
      align: "right",
      width: "90px",
      sortValue: (venue) => venue.estimatedCostUsd,
      render: (venue) => money(venue.estimatedCostUsd),
    },
  ];

  return (
    <DataTable
      rows={venues}
      columns={columns}
      rowKey={(venue) => venue.venueId}
      searchText={(venue) =>
        `${venue.venueId} ${venue.callSites.map((site) => site.name).join(" ")}`
      }
      searchPlaceholder="Filter by venue or call site…"
      initialSort={{ key: "cost", direction: "desc" }}
    />
  );
}
