"use client";

import DataTable from "@/components/data-table";
import StatusPill from "@/components/status-pill";
import type { LostUrl } from "@/lib/reports";
import { KIND_LABEL, outcomeLabel, outcomeSeverity, siteUrl } from "./labels";
import styles from "./page.module.scss";

// Every URL one deploy left behind, searchable by path. Review rows first,
// then redirects, then the expected 404s.
export default function UrlsTable({ urls }: { urls: LostUrl[] }) {
  const rank = (url: LostUrl) =>
    url.review ? 0 : url.outcome === "redirect" ? 1 : 2;

  return (
    <DataTable
      rows={urls}
      rowKey={(url) => url.path}
      initialSort={{ key: "outcome", direction: "asc" }}
      searchText={(url) =>
        `${url.path} ${url.outcome === "redirect" ? url.location : ""}`
      }
      searchPlaceholder="Filter by path…"
      emptyMessage="This deploy left no film URLs behind."
      columns={[
        {
          key: "path",
          header: "URL",
          render: (url) => (
            <a href={siteUrl(url.path)} className={styles.path}>
              {url.path}
            </a>
          ),
          sortValue: (url) => url.path,
        },
        {
          key: "kind",
          header: "Why it went",
          render: (url) => KIND_LABEL[url.kind],
          sortValue: (url) => url.kind,
        },
        {
          key: "outcome",
          header: "Now",
          render: (url) => (
            <>
              <StatusPill severity={outcomeSeverity(url)}>
                {outcomeLabel(url)}
              </StatusPill>
              {url.outcome === "redirect" && (
                <div className={styles.subFigure}>
                  →{" "}
                  <a href={siteUrl(url.location)} className={styles.path}>
                    {url.location}
                  </a>
                </div>
              )}
            </>
          ),
          sortValue: (url) => `${rank(url)} ${outcomeLabel(url)}`,
        },
      ]}
    />
  );
}
