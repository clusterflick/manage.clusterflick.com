"use client";

import { useMemo, useState, type ReactNode } from "react";
import styles from "./index.module.scss";

export type Column<Row> = {
  key: string;
  header: string;
  render: (row: Row) => ReactNode;
  // Returning a number or string makes the column sortable. Omit it for
  // columns that are only ever read, such as a sparkline.
  sortValue?: (row: Row) => number | string;
  align?: "left" | "right";
  width?: string;
};

type Props<Row> = {
  rows: Row[];
  columns: Column<Row>[];
  rowKey: (row: Row) => string;
  initialSort?: { key: string; direction: "asc" | "desc" };
  // Renders a filter box above the table when given. The search runs over
  // whatever this returns for each row.
  searchText?: (row: Row) => string;
  searchPlaceholder?: string;
  // Long tables render this many rows, with a button for the rest - a table of
  // 400 rows is one nobody scrolls, and it costs a second of layout.
  pageSize?: number;
  emptyMessage?: string;
};

export default function DataTable<Row>({
  rows,
  columns,
  rowKey,
  initialSort,
  searchText,
  searchPlaceholder = "Filter…",
  pageSize = 50,
  emptyMessage = "Nothing to show.",
}: Props<Row>) {
  const [sort, setSort] = useState(initialSort ?? null);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);

  const filtered = useMemo(() => {
    if (!searchText || !query.trim()) return rows;
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => searchText(row).toLowerCase().includes(needle));
  }, [rows, query, searchText]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const column = columns.find((entry) => entry.key === sort.key);
    if (!column?.sortValue) return filtered;
    const direction = sort.direction === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const left = column.sortValue!(a);
      const right = column.sortValue!(b);
      if (typeof left === "number" && typeof right === "number") {
        return (left - right) * direction;
      }
      return String(left).localeCompare(String(right)) * direction;
    });
  }, [filtered, sort, columns]);

  const visible = expanded ? sorted : sorted.slice(0, pageSize);
  const hidden = sorted.length - visible.length;

  const toggleSort = (key: string) => {
    setSort((current) =>
      current?.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "desc" },
    );
  };

  return (
    <div>
      {searchText && (
        <div className={styles.controls}>
          <input
            type="search"
            className={styles.search}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
          />
          <span className={styles.resultCount}>
            {sorted.length === rows.length
              ? `${rows.length.toLocaleString("en-GB")} rows`
              : `${sorted.length.toLocaleString("en-GB")} of ${rows.length.toLocaleString("en-GB")}`}
          </span>
        </div>
      )}

      {/* Only the table scrolls sideways, never the page. */}
      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  style={{ width: column.width }}
                  className={column.align === "right" ? styles.right : undefined}
                  aria-sort={
                    sort?.key === column.key
                      ? sort.direction === "asc"
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                >
                  {column.sortValue ? (
                    <button
                      type="button"
                      className={styles.sortButton}
                      onClick={() => toggleSort(column.key)}
                    >
                      {column.header}
                      <span aria-hidden="true" className={styles.sortMark}>
                        {sort?.key === column.key
                          ? sort.direction === "asc"
                            ? "↑"
                            : "↓"
                          : "↕"}
                      </span>
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={column.align === "right" ? styles.right : undefined}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
            {!visible.length && (
              <tr>
                <td colSpan={columns.length} className={styles.empty}>
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {hidden > 0 && (
        <button
          type="button"
          className={styles.more}
          onClick={() => setExpanded(true)}
        >
          Show {hidden.toLocaleString("en-GB")} more
        </button>
      )}
    </div>
  );
}
