"use client";

import DataTable from "@/components/data-table";
import StatusPill from "@/components/status-pill";
import type { LostUrl } from "@/lib/reports";
import { dateTimeLabel } from "@/lib/format";
import { KIND_LABEL, outcomeLabel, outcomeSeverity, siteUrl } from "./labels";
import styles from "./page.module.scss";

type ReviewUrl = LostUrl & { deployedAt: string };

// Every URL worth a look, uncapped: a deploy that loses hundreds of films
// should look as bad as it is. Paged and searchable so a long list stays
// usable. A lost film sorts first whatever its date; otherwise newest first.
export default function ReviewTable({ urls }: { urls: ReviewUrl[] }) {
  return (
    <DataTable
      rows={urls}
      rowKey={(url) => `${url.deployedAt} ${url.path}`}
      initialSort={{ key: "deploy", direction: "desc" }}
      searchText={(url) =>
        `${url.path} ${url.review ?? ""} ${url.outcome === "redirect" ? url.location : ""}`
      }
      searchPlaceholder="Filter by path or reason…"
      columns={[
        {
          key: "path",
          header: "URL",
          render: (url) => (
            <>
              <a href={siteUrl(url.path)} className={styles.path}>
                {url.path}
              </a>
              <div className={styles.subFigure}>{KIND_LABEL[url.kind]}</div>
            </>
          ),
          sortValue: (url) => url.path,
        },
        {
          key: "why",
          header: "Why",
          render: (url) => url.review,
          sortValue: (url) => url.review ?? "",
        },
        {
          key: "now",
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
          sortValue: (url) => outcomeLabel(url),
        },
        {
          key: "deploy",
          header: "Deploy",
          align: "right",
          render: (url) => dateTimeLabel(url.deployedAt),
          // Lost films lead the default order, then the newest deploy.
          sortValue: (url) =>
            `${url.kind === "lost" ? 1 : 0} ${url.deployedAt}`,
        },
      ]}
    />
  );
}
