"use client";

import DataTable, { type Column } from "@/components/data-table";
import type { ResolvedListing } from "@/lib/reports";
import { count, dateTimeLabel } from "@/lib/format";
import styles from "./page.module.scss";

// Listings that carry `isUnmatched` and are nonetheless matched: a double bill
// or shorts block has no single film to resolve to, so the match lives in
// `includedMovies` instead. Shown in full because the whole point is that the
// headline match rate depends on counting these as successes, and a number you
// cannot check is a number you have to trust.
export default function ResolvedTable({ listings }: { listings: ResolvedListing[] }) {
  const columns: Column<ResolvedListing>[] = [
    {
      key: "title",
      header: "Listing",
      sortValue: (listing) => listing.title.toLowerCase(),
      render: (listing) => (
        <div className={styles.titleCell}>
          <a href={listing.url} target="_blank" rel="noreferrer">
            {listing.title}
          </a>
          <div className={styles.categories}>{listing.categories.join(" · ")}</div>
        </div>
      ),
    },
    {
      key: "parts",
      header: "Resolved to",
      sortValue: (listing) => listing.parts.length,
      render: (listing) => (
        <div className={styles.parts}>
          {listing.parts.map((part) => (
            <span
              key={part.id}
              className={part.hasPoster ? styles.part : styles.partNoPoster}
              title={part.hasPoster ? undefined : "No poster on this part"}
            >
              {part.title}
              {part.year && <span className={styles.partYear}>{part.year}</span>}
            </span>
          ))}
        </div>
      ),
    },
    {
      key: "count",
      header: "Films",
      align: "right",
      width: "70px",
      sortValue: (listing) => listing.parts.length,
      render: (listing) => count(listing.parts.length),
    },
    {
      key: "venues",
      header: "Venues",
      sortValue: (listing) => listing.venues.map((venue) => venue.name).join(", "),
      render: (listing) => (
        <span className={styles.venues}>
          {listing.venues.map((venue) => venue.name).join(", ")}
        </span>
      ),
    },
    {
      key: "next",
      header: "Next showing",
      align: "right",
      width: "140px",
      sortValue: (listing) => listing.nextPerformance ?? Infinity,
      render: (listing) =>
        listing.nextPerformance ? (
          dateTimeLabel(listing.nextPerformance)
        ) : (
          <span className={styles.muted}>past only</span>
        ),
    },
  ];

  return (
    <DataTable
      rows={listings}
      columns={columns}
      rowKey={(listing) => listing.id}
      searchText={(listing) =>
        `${listing.title} ${listing.parts.map((part) => part.title).join(" ")} ${listing.venues
          .map((venue) => venue.name)
          .join(" ")}`
      }
      searchPlaceholder="Filter by listing, film or venue…"
      initialSort={{ key: "count", direction: "desc" }}
    />
  );
}
