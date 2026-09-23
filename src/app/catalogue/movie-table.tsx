"use client";

import DataTable, { type Column } from "@/components/data-table";
import type { MovieSummary } from "@/lib/reports";
import { count, dateTimeLabel } from "@/lib/format";
import styles from "./page.module.scss";

// Shared by the unmatched lists and the missing-field examples: the same row
// means the same thing everywhere, so it is worth defining once.
export default function MovieTable({
  movies,
  emptyMessage,
  showNext = true,
}: {
  movies: MovieSummary[];
  emptyMessage?: string;
  showNext?: boolean;
}) {
  const columns: Column<MovieSummary>[] = [
    {
      key: "title",
      header: "Title",
      sortValue: (movie) => movie.title.toLowerCase(),
      render: (movie) => (
        <div className={styles.titleCell}>
          <a href={movie.url} target="_blank" rel="noreferrer">
            {movie.title}
          </a>
          {movie.year && <span className={styles.year}>{movie.year}</span>}
          <div className={styles.categories}>{movie.categories.join(" · ")}</div>
        </div>
      ),
    },
    {
      key: "venues",
      header: "Venues",
      sortValue: (movie) => movie.venues.map((venue) => venue.name).join(", "),
      render: (movie) => (
        <span className={styles.venues}>
          {movie.venues.map((venue) => venue.name).join(", ")}
        </span>
      ),
    },
    {
      key: "performances",
      header: "Perfs",
      align: "right",
      width: "70px",
      sortValue: (movie) => movie.performances,
      render: (movie) => count(movie.performances),
    },
    ...(showNext
      ? [
          {
            key: "next",
            header: "Next showing",
            align: "right" as const,
            width: "140px",
            // Past-only titles sort last under either direction, so a descending
            // click doesn't fill the top of the table with history.
            sortValue: (movie: MovieSummary) => movie.nextPerformance ?? Infinity,
            render: (movie: MovieSummary) =>
              movie.nextPerformance ? (
                dateTimeLabel(movie.nextPerformance)
              ) : (
                <span className={styles.muted}>past only</span>
              ),
          },
        ]
      : []),
  ];

  return (
    <DataTable
      rows={movies}
      columns={columns}
      rowKey={(movie) => movie.id}
      searchText={(movie) =>
        `${movie.title} ${movie.venues.map((venue) => venue.name).join(" ")} ${movie.categories.join(" ")}`
      }
      searchPlaceholder="Filter by title, venue or category…"
      initialSort={showNext ? { key: "next", direction: "asc" } : undefined}
      emptyMessage={emptyMessage}
    />
  );
}
