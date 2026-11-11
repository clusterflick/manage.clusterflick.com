"use client";

import DataTable, { type Column } from "@/components/data-table";
import Sparkline from "@/components/charts/sparkline";
import type { AccessibilitySource, AccessibilityTag } from "@/lib/reports";
import { count, percent } from "@/lib/format";
import { KIND_LABEL, TAG_LABEL, TAG_SHORT, TAG_SLOT } from "./labels";
import styles from "./page.module.scss";

type Props = {
  sources: AccessibilitySource[];
  tags: AccessibilityTag[];
};

export default function SourcesTable({ sources, tags }: Props) {
  const columns: Column<AccessibilitySource>[] = [
    {
      key: "name",
      header: "Source",
      sortValue: (source) => source.name.toLowerCase(),
      render: (source) => (
        <>
          <div className={styles.sourceName}>{source.name}</div>
          <div className={styles.subFigure}>
            {source.kind === "chain"
              ? `chain · ${source.venues} venues`
              : (source.id ?? "venue")}
          </div>
        </>
      ),
    },
    {
      key: "performances",
      header: "Performances",
      align: "right",
      sortValue: (source) => source.performances,
      render: (source) => count(source.performances),
    },
    ...tags.map((tag): Column<AccessibilitySource> => ({
      key: tag,
      header: TAG_SHORT[tag],
      align: "right",
      // Sorted on the share now, so the sources with none sink together.
      sortValue: (source) =>
        source.performances > 0
          ? (source.tags[tag]?.latest ?? 0) / source.performances
          : 0,
      render: (source) => {
        const detail = source.tags[tag];
        if (!detail) return <span className={styles.muted}>—</span>;
        const share =
          source.performances > 0 ? detail.latest / source.performances : 0;
        return (
          <div className={styles.tagCell}>
            <Sparkline
              values={detail.series}
              label={`${TAG_LABEL[tag]} share of ${source.name}'s performances, one point per release`}
              slot={TAG_SLOT[tag]}
              width={72}
              height={22}
              showGaps={false}
            />
            <div>
              {percent(share, share > 0 && share < 0.1 ? 1 : 0)}
              {detail.kind && (
                <span className={styles[detail.kind]}>
                  {" "}
                  {KIND_LABEL[detail.kind]}
                </span>
              )}
            </div>
            <div className={styles.subFigure}>{count(detail.latest)}</div>
          </div>
        );
      },
    })),
  ];

  return (
    <DataTable
      rows={sources}
      columns={columns}
      rowKey={(source) => source.key}
      searchText={(source) =>
        `${source.name} ${source.id ?? ""} ${source.chain ?? ""}`
      }
      searchPlaceholder="Filter sources…"
      pageSize={40}
    />
  );
}
