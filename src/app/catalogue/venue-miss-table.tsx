"use client";

import DataTable, { type Column } from "@/components/data-table";
import Meter from "@/components/meter";
import type { CatalogueReport } from "@/lib/reports";
import { count, percent } from "@/lib/format";
import styles from "./page.module.scss";

type Venue = CatalogueReport["byVenue"][number];

export default function VenueMissTable({ venues }: { venues: Venue[] }) {
  const columns: Column<Venue>[] = [
    {
      key: "name",
      header: "Venue",
      sortValue: (venue) => venue.name.toLowerCase(),
      render: (venue) => (
        <div className={styles.titleCell}>
          {venue.name}
          <div className={`${styles.categories} mono`}>{venue.id}</div>
        </div>
      ),
    },
    {
      key: "type",
      header: "Type",
      sortValue: (venue) => venue.type ?? "",
      render: (venue) => venue.type ?? <span className={styles.muted}>—</span>,
    },
    {
      key: "filmShowings",
      header: "Film showings",
      align: "right",
      sortValue: (venue) => venue.filmShowings,
      render: (venue) => count(venue.filmShowings),
    },
    {
      key: "unmatched",
      header: "Unmatched",
      align: "right",
      sortValue: (venue) => venue.unmatched,
      render: (venue) =>
        venue.unmatched === 0 ? (
          <span className={styles.muted}>—</span>
        ) : (
          count(venue.unmatched)
        ),
    },
    {
      key: "missRate",
      header: "Miss rate",
      align: "right",
      width: "110px",
      sortValue: (venue) => venue.missRate,
      render: (venue) => percent(venue.missRate, 0),
    },
    {
      key: "bar",
      header: "",
      width: "90px",
      render: (venue) => (
        <Meter
          value={venue.missRate}
          label={`${venue.name}: ${percent(venue.missRate, 0)} of film showings unmatched`}
          slot={2}
        />
      ),
    },
  ];

  return (
    <DataTable
      rows={venues}
      columns={columns}
      rowKey={(venue) => venue.id}
      searchText={(venue) => `${venue.name} ${venue.id} ${venue.type ?? ""}`}
      searchPlaceholder="Filter venues…"
      pageSize={30}
    />
  );
}
