"use client";

import DataTable, { type Column } from "@/components/data-table";
import type { NormaliserPair } from "@/lib/reports";
import { count } from "@/lib/format";
import styles from "./page.module.scss";

// Kinds a normaliser rule could fix lead the default order; a genuinely
// different title is what the LLM is for.
const KIND_ORDER: Record<NormaliserPair["kind"], number> = {
  article: 0,
  spacing: 1,
  "extra words": 2,
  "different title": 3,
};

export default function NormaliserTable({ pairs }: { pairs: NormaliserPair[] }) {
  const columns: Column<NormaliserPair>[] = [
    {
      key: "venueTitle",
      header: "Venue title, normalised",
      sortValue: (pair) => pair.venueTitle,
      render: (pair) => (
        <div className={styles.titleCell}>
          <span className="mono">{pair.venueTitle}</span>
          <div className={styles.categories}>{pair.examples.join(" · ")}</div>
        </div>
      ),
    },
    {
      key: "tmdbTitle",
      header: "TMDB title, normalised",
      sortValue: (pair) => pair.tmdbTitle,
      render: (pair) => (
        <div className={styles.titleCell}>
          <span className="mono">{pair.tmdbTitle}</span>
          <div className={styles.categories}>
            {pair.url ? (
              <a href={pair.url} target="_blank" rel="noreferrer">
                {pair.tmdb.title}
              </a>
            ) : (
              pair.tmdb.title
            )}
          </div>
        </div>
      ),
    },
    {
      key: "kind",
      header: "Differs by",
      width: "130px",
      sortValue: (pair) => KIND_ORDER[pair.kind],
      render: (pair) => <span className={styles.kind}>{pair.kind}</span>,
    },
    {
      key: "listings",
      header: "Listings",
      align: "right",
      width: "90px",
      sortValue: (pair) => pair.listings,
      render: (pair) => count(pair.listings),
    },
    {
      key: "venues",
      header: "Venues",
      sortValue: (pair) => pair.venues.map((venue) => venue.name).join(", "),
      render: (pair) => (
        <span className={styles.venues}>
          {pair.venues.map((venue) => venue.name).join(", ")}
        </span>
      ),
    },
  ];

  return (
    <DataTable
      rows={pairs}
      columns={columns}
      rowKey={(pair) => pair.key}
      searchText={(pair) =>
        `${pair.venueTitle} ${pair.tmdbTitle} ${pair.examples.join(" ")} ${pair.kind} ${pair.venues
          .map((venue) => venue.name)
          .join(" ")}`
      }
      searchPlaceholder="Filter by title, venue or kind…"
      initialSort={{ key: "kind", direction: "asc" }}
      emptyMessage="Every matched listing normalises to its TMDB title."
    />
  );
}
