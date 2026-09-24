"use client";

import DataTable, { type Column } from "@/components/data-table";
import Sparkline from "@/components/charts/sparkline";
import StatusPill from "@/components/status-pill";
import type { HealthVenue } from "@/lib/reports";
import { failureStatus } from "@/lib/status";
import RelativeTime from "@/components/relative-time";
import { count, dateTimeLabel, duration } from "@/lib/format";
import styles from "./page.module.scss";

// What each failure kind means, so a fortnight of 503s is not read as a scraper
// to fix.
const KIND_MEANING: Record<string, string> = {
  "probe-error": "The probe itself failed — a timeout, a bad status, or a fetch that never completed. Ours to fix.",
  "source-maintenance": "The venue answered with a maintenance status. Theirs to fix; worth watching if it persists.",
  "source-queue": "The venue put the probe in a virtual waiting room. Expected around on-sales.",
  "bot-challenge": "The venue's bot protection challenged the probe instead of answering. Usually a blocked IP rather than an outage.",
  "no-counts": "The probe completed but reported no counts at all.",
};

function FailureSummary({ venue, builtAt }: { venue: HealthVenue; builtAt: number }) {
  const { kinds, messages } = venue.failureSummary;
  return (
    <div className={styles.failureSummary}>
      <ul className={styles.kindList}>
        {kinds.map((kind) => (
          <li key={kind.kind}>
            <span className={styles.kindName}>
              {kind.kind} × {count(kind.count)}
            </span>
            <span className={styles.kindMeaning}>
              {KIND_MEANING[kind.kind] ?? "Not a kind this report has been taught."}
            </span>
          </li>
        ))}
      </ul>
      <ul className={styles.messageList}>
        {messages.map((entry) => (
          <li key={`${entry.kind}-${entry.message}`}>
            <span className={styles.message}>{entry.message ?? "No message"}</span>
            <span className={styles.messageMeta}>
              {entry.count > 1 &&
                `${count(entry.count)} times, ${dateTimeLabel(entry.firstAt)} to `}
              <RelativeTime value={entry.lastAt} builtAt={builtAt} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function HealthTable({
  venues,
  cycles,
  builtAt,
}: {
  venues: HealthVenue[];
  cycles: number;
  builtAt: number;
}) {
  const columns: Column<HealthVenue>[] = [
    {
      key: "venue",
      header: "Source",
      sortValue: (venue) => venue.venue,
      render: (venue) => (
        <div>
          <span className={`${styles.venueId} mono`}>{venue.venue}</span>
          <div className={styles.granularity}>
            reports {venue.granularity.replace(/-/g, " ")}
          </div>
        </div>
      ),
    },
    {
      key: "trend",
      header: `Films per cycle`,
      width: "120px",
      render: (venue) => (
        <Sparkline
          values={venue.series}
          label={`${venue.venue}: films per probe across ${cycles} cycles, gaps marked where the probe returned nothing`}
          slot={3}
        />
      ),
    },
    {
      key: "films",
      header: "Films",
      align: "right",
      width: "100px",
      sortValue: (venue) => venue.films.latest ?? -1,
      render: (venue) => (
        <>
          {venue.films.latest === null ? (
            <span className={styles.muted}>—</span>
          ) : (
            count(venue.films.latest)
          )}
          <div className={styles.subFigure}>
            med {venue.films.median ?? "—"}
          </div>
        </>
      ),
    },
    {
      key: "dates",
      header: "Dates",
      align: "right",
      width: "70px",
      sortValue: (venue) => venue.dates ?? -1,
      render: (venue) =>
        venue.dates === null ? <span className={styles.muted}>—</span> : count(venue.dates),
    },
    {
      key: "metric",
      header: "Detail",
      align: "right",
      width: "130px",
      sortValue: (venue) => venue.metricValue ?? -1,
      render: (venue) =>
        // Never summed with any other row: a chain counting performances and
        // one counting film-date pairs are counting different things, so the
        // figure is always printed with the name of what it counts.
        venue.metric && venue.metricValue !== null ? (
          <>
            {count(venue.metricValue)}
            <div className={styles.subFigure}>{venue.metric}</div>
          </>
        ) : (
          <span className={styles.muted}>not counted</span>
        ),
    },
    {
      key: "failures",
      header: "Failures",
      align: "right",
      width: "120px",
      sortValue: (venue) => venue.failureRate,
      render: (venue) =>
        venue.failures === 0 ? (
          <span className={styles.muted}>none</span>
        ) : (
          <StatusPill severity={failureStatus(venue.failureRate)}>
            {venue.failures} / {venue.probes}
          </StatusPill>
        ),
    },
    {
      key: "duration",
      header: "Probe time",
      align: "right",
      width: "100px",
      sortValue: (venue) => venue.durationMs.median ?? 0,
      render: (venue) => (
        <>
          {duration(venue.durationMs.median)}
          <div className={styles.subFigure}>p90 {duration(venue.durationMs.p90)}</div>
        </>
      ),
    },
    {
      key: "last",
      header: "Last probe",
      align: "right",
      width: "110px",
      sortValue: (venue) => venue.lastProbedAt,
      render: (venue) => (
        <span className={styles.muted}>
          <RelativeTime value={venue.lastProbedAt} builtAt={builtAt} />
        </span>
      ),
    },
  ];

  return (
    <DataTable
      rows={venues}
      columns={columns}
      rowKey={(venue) => venue.venue}
      searchText={(venue) => venue.venue}
      searchPlaceholder="Filter sources…"
      initialSort={{ key: "failures", direction: "desc" }}
      renderExpanded={(venue) =>
        venue.failures === 0 ? null : <FailureSummary venue={venue} builtAt={builtAt} />
      }
    />
  );
}
