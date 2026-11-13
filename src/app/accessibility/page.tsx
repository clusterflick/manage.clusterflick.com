import Panel from "@/components/panel";
import PageHeader from "@/components/page-header";
import StatTile from "@/components/stat-tile";
import StatGrid from "@/components/stat-tile/grid";
import StatusPill from "@/components/status-pill";
import LineChart from "@/components/charts/line-chart";
import Sparkline from "@/components/charts/sparkline";
import { accessibility } from "@/lib/reports";
import { count, dateLabel, percent } from "@/lib/format";
import SourcesTable from "@/components/share-trend/sources-table";
import {
  KIND_LABEL,
  KIND_SEVERITY,
  TAG_LABEL,
  TAG_SHORT,
  TAG_SLOT,
} from "./labels";
import styles from "@/components/share-trend/index.module.scss";

export const metadata = { title: "Accessibility — Clusterflick manage" };

// One decimal below 10%, where a whole percent would hide most of the change
// these rows exist to show.
const share = (value: number) =>
  percent(value, value > 0 && value < 0.1 ? 1 : 0);

export default function AccessibilityPage() {
  if (accessibility.empty) {
    return (
      <PageHeader
        title="Accessibility"
        meta="No data-combined history has been collected yet."
      />
    );
  }

  const { window, flags, tags, totals, sources, releases } = accessibility;
  const lost = flags.filter((flag) => flag.kind !== "new");
  const appeared = flags.filter((flag) => flag.kind === "new");

  return (
    <>
      <PageHeader
        title="Accessibility"
        meta={
          <>
            The share of each source&apos;s performances carrying each
            accessibility tag, followed through {window.releases} data-combined
            releases over {window.days} days ({dateLabel(window.firstAt)} to{" "}
            {dateLabel(window.lastAt)})
          </>
        }
      />

      <Panel
        id="lost"
        title={
          lost.length
            ? `${lost.length} ${lost.length === 1 ? "tag has" : "tags have"} fallen away`
            : "No tag has fallen away"
        }
        note={
          <>
            A source whose tag has gone, or dropped to under about a third of
            where it sat before the last {window.baselineGapDays} days. Nothing
            fails when a mapping stops matching — the tag just stops appearing —
            so this is the only place it shows. A flag is a prompt to look: a
            share also moves when the programme does.
          </>
        }
        actions={
          <StatusPill severity={lost.length ? "serious" : "good"}>
            {lost.length ? `${lost.length} to check` : "all clear"}
          </StatusPill>
        }
        flush={lost.length > 0}
      >
        {lost.length > 0 ? (
          <div className={styles.scroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Tag</th>
                  <th>Change</th>
                  <th>Share of performances</th>
                  <th className={styles.right}>Tagged now</th>
                  <th className={styles.right}>Since</th>
                </tr>
              </thead>
              <tbody>
                {lost.map((flag) => (
                  <tr key={flag.key}>
                    <td>
                      <div className={styles.sourceName}>
                        {flag.source.name}
                      </div>
                      <div className={styles.subFigure}>
                        {flag.source.kind === "chain"
                          ? `chain · ${flag.source.venues} venues`
                          : flag.source.id}
                      </div>
                    </td>
                    <td className={styles.nowrap}>{TAG_LABEL[flag.tag]}</td>
                    <td>
                      <StatusPill severity={KIND_SEVERITY[flag.kind]}>
                        {KIND_LABEL[flag.kind]}
                      </StatusPill>
                    </td>
                    <td>
                      <div className={styles.change}>
                        {share(flag.baseline)}
                        <span className={styles.arrow} aria-label="to">
                          →
                        </span>
                        {share(flag.current)}
                      </div>
                      <Sparkline
                        values={flag.series}
                        label={`${TAG_LABEL[flag.tag]} share of ${flag.source.name}'s performances, one point per release`}
                        slot={TAG_SLOT[flag.tag]}
                        width={140}
                        showGaps={false}
                      />
                    </td>
                    <td className={styles.right}>
                      {count(flag.latest)}
                      <div className={styles.subFigure}>
                        of {count(flag.performances)}
                      </div>
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
            Across {totals.sourcesMeasured} sources, every tag is within reach
            of its usual share.
          </p>
        )}
      </Panel>

      <StatGrid>
        {tags.map((tag) => (
          <StatTile
            key={tag.tag}
            label={TAG_LABEL[tag.tag]}
            value={share(tag.share)}
            detail={`${count(tag.tagged)} of ${count(tag.performances)} performances in the latest release`}
          />
        ))}
      </StatGrid>

      <Panel
        title="Share of all performances"
        note="Every source together, one point per release: a release a week, then a release a day for the most recent fortnight. A chain losing a tag moves these lines; a single venue does not, which is what the table above is for."
      >
        <LineChart
          series={tags.map((tag) => ({
            key: tag.tag,
            label: TAG_LABEL[tag.tag],
            values: tag.series,
            slot: TAG_SLOT[tag.tag],
          }))}
          labels={releases.map((release) => dateLabel(release.publishedAt))}
          format="percent"
          height={240}
        />
      </Panel>

      {appeared.length > 0 && (
        <Panel
          id="appeared"
          title={`${appeared.length} ${appeared.length === 1 ? "tag has" : "tags have"} appeared`}
          note="A tag that was all but absent from a source and is now on a fifth of its programme or more. Usually a mapping that has just been added - but one that has started matching too much looks the same."
          flush
        >
          <div className={styles.scroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Tag</th>
                  <th>Share of performances</th>
                  <th className={styles.right}>Tagged now</th>
                </tr>
              </thead>
              <tbody>
                {appeared.map((flag) => (
                  <tr key={flag.key}>
                    <td>
                      <div className={styles.sourceName}>
                        {flag.source.name}
                      </div>
                      <div className={styles.subFigure}>
                        {flag.source.kind === "chain"
                          ? `chain · ${flag.source.venues} venues`
                          : flag.source.id}
                      </div>
                    </td>
                    <td className={styles.nowrap}>{TAG_LABEL[flag.tag]}</td>
                    <td>
                      <div className={styles.change}>
                        {share(flag.baseline)}
                        <span className={styles.arrow} aria-label="to">
                          →
                        </span>
                        {share(flag.current)}
                      </div>
                      <Sparkline
                        values={flag.series}
                        label={`${TAG_LABEL[flag.tag]} share of ${flag.source.name}'s performances, one point per release`}
                        slot={TAG_SLOT[flag.tag]}
                        width={140}
                        showGaps={false}
                      />
                    </td>
                    <td className={styles.right}>
                      {count(flag.latest)}
                      <div className={styles.subFigure}>
                        of {count(flag.performances)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <Panel
        title="Sources"
        note="Chains first, then venues by how much they have on. Each cell is the tag's share of that source's performances now, over its history. A share that looks wrong without having tripped a flag is still worth a look - a tag a source has never carried is not something a trend can notice."
        flush
      >
        <SourcesTable
          sources={sources}
          keys={tags.map((tag) => tag.tag)}
          label={TAG_LABEL}
          short={TAG_SHORT}
          slot={TAG_SLOT}
        />
      </Panel>

      <Panel title="How a flag is raised">
        <ul className={styles.method}>
          <li>
            <strong>Now</strong> is the last {window.recentDays} days pooled, so
            one release missing a monthly screening does not count as a loss.
          </li>
          <li>
            <strong>Usual</strong> is the median share before the last{" "}
            {window.baselineGapDays} days. The gap keeps a decline that is still
            under way out of its own baseline.
          </li>
          <li>
            <strong>Gone</strong>: on nothing now, having been there in most
            earlier releases. <strong>Fallen</strong>: under about a third of
            usual. Either way only where usual would put at least five tagged
            performances in the latest release.
          </li>
          <li>
            A chain is one source, because its venues share a site and a
            mapping. A venue in a chain is flagged on its own only where the
            chain is not.
          </li>
          <li>
            This cannot see a tag we have never mapped, or a source whose data
            has always been thin. It only notices change.
          </li>
        </ul>
      </Panel>
    </>
  );
}
