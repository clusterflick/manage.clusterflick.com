import Panel from "@/components/panel";
import PageHeader from "@/components/page-header";
import StatTile from "@/components/stat-tile";
import StatGrid from "@/components/stat-tile/grid";
import StatusPill from "@/components/status-pill";
import LineChart from "@/components/charts/line-chart";
import { matched } from "@/lib/reports";
import type { MatchedFlag, MatchedSourceReport } from "@/lib/reports";
import { count, dateLabel, percent } from "@/lib/format";
import {
  KIND_LABEL,
  KIND_SEVERITY,
  SCORE_LABEL,
  SOURCE_LABEL,
  SOURCE_SLOT,
} from "./labels";
import styles from "./page.module.scss";

export const metadata = { title: "Matching — Clusterflick manage" };

// Usual and now, in whichever terms the flag is about.
function change(flag: MatchedFlag, source: MatchedSourceReport) {
  const { baseline, latest } = source;
  if (flag.kind === "missing") {
    return baseline ? `${count(baseline.matched)} matches → none` : "—";
  }
  if (flag.kind === "matches-fell") {
    return `${count(baseline?.matched ?? 0)} → ${count(latest?.matched ?? 0)}`;
  }
  return `${baseline ? percent(baseline.share) : "—"} → ${percent(latest?.share ?? 0)}`;
}

export default function MatchingPage() {
  if (matched.empty) {
    return (
      <PageHeader
        title="Matching"
        meta="No data-matched history has been collected yet."
      />
    );
  }

  const { window, flags, sources, releases } = matched;
  const bySource = Object.fromEntries(
    sources.map((source) => [source.source, source]),
  );
  const labels = releases.map((release) => dateLabel(release.publishedAt));
  const fallPercent = percent(window.fallRatio);

  return (
    <>
      <PageHeader
        title="Matching"
        meta={
          <>
            How many films each rating source matched, and how many of those
            carry a score, through {window.releases} data-matched releases over{" "}
            {window.days} days ({dateLabel(window.firstAt)} to{" "}
            {dateLabel(window.lastAt)})
          </>
        }
      />

      <Panel
        id="flags"
        title={
          flags.length
            ? `${flags.length} ${flags.length === 1 ? "source needs" : "sources need"} a look`
            : "Every source is matching as usual"
        }
        note={
          <>
            A source breaks without failing: the site changes, our reading of it
            stops matching, and films go out with no rating. When Rotten
            Tomatoes renamed its score field, every film still matched and none
            had a score. match now refuses to publish a source with no matches
            or no scores; this catches a fall short of that.
          </>
        }
        actions={
          <StatusPill severity={flags.length ? "critical" : "good"}>
            {flags.length ? `${flags.length} to check` : "all clear"}
          </StatusPill>
        }
        flush={flags.length > 0}
      >
        {flags.length > 0 ? (
          <div className={styles.scroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Problem</th>
                  <th>Usual → now</th>
                  <th className={styles.right}>Since</th>
                </tr>
              </thead>
              <tbody>
                {flags.map((flag) => (
                  <tr key={flag.key}>
                    <td className={styles.sourceName}>
                      {SOURCE_LABEL[flag.source]}
                    </td>
                    <td>
                      <StatusPill severity={KIND_SEVERITY[flag.kind]}>
                        {KIND_LABEL[flag.kind]}
                      </StatusPill>
                    </td>
                    <td className={styles.change}>
                      {change(flag, bySource[flag.source])}
                    </td>
                    <td className={styles.right}>
                      {flag.since ? dateLabel(flag.since) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={styles.allClear}>
            All {sources.length} sources are matching about as many films as
            usual, with about as many of them scored.
          </p>
        )}
      </Panel>

      <StatGrid>
        {sources.map((source) => (
          <StatTile
            key={source.source}
            label={SOURCE_LABEL[source.source]}
            value={source.latest ? percent(source.latest.share) : "missing"}
            detail={
              source.latest
                ? `${count(source.latest.scored)} of ${count(source.latest.matched)} matches carry a ${SCORE_LABEL[source.source]}${source.baseline ? `, usually ${percent(source.baseline.share)}` : ""}`
                : "Not in the latest data-matched release"
            }
            severity={
              flags.some((flag) => flag.source === source.source)
                ? "critical"
                : undefined
            }
          />
        ))}
      </StatGrid>

      <Panel
        title="Matches carrying a score"
        note="The share of each source's matches that carry the score the website shows, one point per release. Some films are too new or too obscure to have one, so most sources sit below 100% - what matters is that each line holds where it usually does."
      >
        <LineChart
          series={sources.map((source) => ({
            key: source.source,
            label: SOURCE_LABEL[source.source],
            values: source.shareSeries,
            slot: SOURCE_SLOT[source.source],
          }))}
          labels={labels}
          format="percent"
          height={240}
        />
      </Panel>

      <Panel
        title="Films matched"
        note="How many films each source matched, one point per release. These move with the programme - a busy week has more films to match - so read them against each other: a source falling while the rest hold is the one to look at."
      >
        <LineChart
          series={sources.map((source) => ({
            key: source.source,
            label: SOURCE_LABEL[source.source],
            values: source.matchedSeries,
            slot: SOURCE_SLOT[source.source],
          }))}
          labels={labels}
          format="count"
          height={240}
        />
      </Panel>

      <Panel title="How a flag is raised">
        <ul className={styles.method}>
          <li>
            <strong>Now</strong> is the latest release. data-matched publishes
            once a day, and each release is a full match of the catalogue, so
            one release is a complete reading.
          </li>
          <li>
            <strong>Usual</strong> is the median before the last{" "}
            {window.baselineGapDays} days, so a break that has gone on for days
            is not already part of its own baseline.
          </li>
          <li>
            <strong>Missing</strong>: the source is not in the latest release.{" "}
            <strong>No scores</strong>: it matched films and none carry a score.{" "}
            <strong>Fewer scores</strong> and <strong>fewer matches</strong>:
            under {fallPercent} of usual. Over 90 days of normal running the
            lowest either fell was 82% of usual.
          </li>
          <li>
            The score is the one the website shows for that source. A rating the
            website does not read can break without this noticing.
          </li>
        </ul>
      </Panel>
    </>
  );
}
