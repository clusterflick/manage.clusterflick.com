"use client";

import DataTable, { type Column } from "@/components/data-table";
import Sparkline from "@/components/charts/sparkline";
import type { ShareSource } from "@/lib/reports";
import { count, percent } from "@/lib/format";
import { KIND_LABEL } from "./labels";
import styles from "./index.module.scss";

// The labels of whichever trend this is a table of - accessibility tags,
// occasion kinds. Passed as records rather than functions, since this is a
// client component rendered from a prerendered server page.
type Props<Key extends string> = {
  sources: ShareSource<Key>[];
  keys: Key[];
  label: Record<Key, string>;
  // Short enough for a column header.
  short: Record<Key, string>;
  slot: Record<Key, number>;
};

export default function SourcesTable<Key extends string>({
  sources,
  keys,
  label,
  short,
  slot,
}: Props<Key>) {
  const columns: Column<ShareSource<Key>>[] = [
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
    ...keys.map((key): Column<ShareSource<Key>> => ({
      key,
      header: short[key],
      align: "right",
      // Sorted on the share now, so the sources with none sink together.
      sortValue: (source) =>
        source.performances > 0
          ? (source.tags[key]?.latest ?? 0) / source.performances
          : 0,
      render: (source) => {
        const detail = source.tags[key];
        if (!detail) return <span className={styles.muted}>—</span>;
        const share =
          source.performances > 0 ? detail.latest / source.performances : 0;
        return (
          <div className={styles.tagCell}>
            <Sparkline
              values={detail.series}
              label={`${label[key]} share of ${source.name}'s performances, one point per release`}
              slot={slot[key]}
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
