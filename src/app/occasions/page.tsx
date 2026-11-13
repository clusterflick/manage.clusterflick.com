import Panel from "@/components/panel";
import PageHeader from "@/components/page-header";
import StatTile from "@/components/stat-tile";
import StatGrid from "@/components/stat-tile/grid";
import StatusPill from "@/components/status-pill";
import LineChart from "@/components/charts/line-chart";
import Sparkline from "@/components/charts/sparkline";
import SourcesTable from "@/components/share-trend/sources-table";
import { KIND_LABEL, KIND_SEVERITY } from "@/components/share-trend/labels";
import styles from "@/components/share-trend/index.module.scss";
import { occasions, type OccasionFlag } from "@/lib/reports";
import { count, dateLabel, dateTimeLabel, percent } from "@/lib/format";
import { OCCASION_LABEL, OCCASION_SHORT, OCCASION_SLOT } from "./labels";

export const metadata = { title: "Occasions — Clusterflick manage" };

// One decimal below 10%, where a whole percent would hide most of the change
// these rows exist to show. Occasions mostly sit well under it.
const share = (value: number) =>
  percent(value, value > 0 && value < 0.1 ? 1 : 0);

function FlagTable({
  flags,
  showSince,
}: {
  flags: OccasionFlag[];
  showSince: "lost" | "appeared";
}) {
  return (
    <div className={styles.scroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Source</th>
            <th>Occasion</th>
            <th>Change</th>
            <th>Share of performances</th>
            <th className={styles.right}>Now</th>
            <th className={styles.right}>
              {showSince === "lost" ? "Since" : "From"}
            </th>
            <th>Rule change at that release</th>
          </tr>
        </thead>
        <tbody>
          {flags.map((flag) => (
            <tr key={flag.key}>
              <td>
                <div className={styles.sourceName}>{flag.source.name}</div>
                <div className={styles.subFigure}>
                  {flag.source.kind === "chain"
                    ? `chain · ${flag.source.venues} venues`
                    : flag.source.id}
                </div>
              </td>
              <td className={styles.nowrap}>{OCCASION_LABEL[flag.tag]}</td>
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
                  label={`${OCCASION_LABEL[flag.tag]} share of ${flag.source.name}'s performances, one point per release`}
                  slot={OCCASION_SLOT[flag.tag]}
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
              <td>
                {flag.rule ? (
                  <a href={flag.rule.url}>{flag.rule.message}</a>
                ) : (
                  <span className={styles.muted}>none</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function OccasionsPage() {
  if (occasions.empty) {
    return (
      <PageHeader
        title="Occasions"
        meta="No data-combined release in the window carries occasions yet."
      />
    );
  }

  const { window, flags, kinds, named, rules, totals, sources, releases } =
    occasions;
  const lost = flags.filter((flag) => flag.kind !== "new");
  const appeared = flags.filter((flag) => flag.kind === "new");
  const any = kinds.find((kind) => kind.kind === "any")!;
  const each = kinds.filter((kind) => kind.kind !== "any");
  const labels = releases.map((release) => dateLabel(release.publishedAt));
  const markers = rules.map((rule) => ({
    index: rule.releaseIndex,
    label: `Rule change: ${rule.message}`,
  }));

  return (
    <>
      <PageHeader
        title="Occasions"
        meta={
          <>
            The share of each source&apos;s performances carrying each occasion
            — an intro, a Q&amp;A, a live score — followed through{" "}
            {window.releases} data-combined releases over {window.days} days,
            from the first to carry them ({dateLabel(window.publishedFrom)}) to{" "}
            {dateLabel(window.lastAt)}
          </>
        }
      />

      {window.flagsFrom ? (
        <Panel
          title="Not enough history to flag anything yet"
          note={
            <>
              A flag compares the last {window.recentDays} days with the usual
              share from before the last {window.baselineGapDays} days, and
              needs several releases from then. Occasions were first published
              on {dateLabel(window.publishedFrom)}, so that history arrives
              around {dateLabel(window.flagsFrom)}. Until then, read the charts
              and the sources table by eye — and against the rule changes drawn
              on them.
            </>
          }
          actions={<StatusPill severity="warning">collecting</StatusPill>}
        >
          <p className={styles.allClear}>
            Measuring {totals.sourcesMeasured} sources.
          </p>
        </Panel>
      ) : (
        <>
          <Panel
            id="lost"
            title={
              lost.length
                ? `${lost.length} ${lost.length === 1 ? "occasion has" : "occasions have"} fallen away`
                : "No occasion has fallen away"
            }
            note={
              <>
                A source whose occasion has gone, or dropped to under about a
                third of where it sat before the last {window.baselineGapDays}{" "}
                days. Most occasions are read from the venue&apos;s own words,
                so a fall is a venue rewording its pages, a retrieve that
                stopped fetching descriptions, or a change to our rules — check
                the rule change beside it first. A share also moves when the
                programme does.
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
              <FlagTable flags={lost} showSince="lost" />
            ) : (
              <p className={styles.allClear}>
                Across {totals.sourcesMeasured} sources, every occasion is
                within reach of its usual share.
              </p>
            )}
          </Panel>

          <Panel
            id="appeared"
            title={
              appeared.length
                ? `${appeared.length} ${appeared.length === 1 ? "occasion has" : "occasions have"} appeared`
                : "No occasion has appeared"
            }
            note="An occasion that was all but absent from a source and is now on a tenth of its programme or more. A rule that has started reading a synopsis as an intro looks like this, and puts that film on the website's home page - so this sits beside the losses rather than below them."
            actions={
              <StatusPill severity={appeared.length ? "warning" : "good"}>
                {appeared.length ? `${appeared.length} to check` : "all clear"}
              </StatusPill>
            }
            flush={appeared.length > 0}
          >
            {appeared.length > 0 ? (
              <FlagTable flags={appeared} showSince="appeared" />
            ) : (
              <p className={styles.allClear}>
                Nothing has started carrying occasions it didn&apos;t before.
              </p>
            )}
          </Panel>
        </>
      )}

      <StatGrid>
        <StatTile
          label="Any occasion"
          value={share(any.share)}
          detail={`${count(any.tagged)} of ${count(any.performances)} performances in the latest release`}
        />
        <StatTile
          label="Naming who is involved"
          value={share(named.share)}
          detail={`${count(named.withNames)} of ${count(named.occasions)} performances with an occasion`}
        />
        <StatTile
          label="Rule changes"
          value={count(rules.length)}
          detail={`Commits to the occasion rules over these ${window.days} days`}
          href="#rules"
        />
      </StatGrid>

      <Panel
        title="Share of all performances with an occasion"
        note="Every source together, one point per release. Dashed lines are the releases a change to the rules first reached - hover one for the change. A step at a dashed line is ours; a step anywhere else is a venue."
      >
        <LineChart
          series={[
            {
              key: "any",
              label: OCCASION_LABEL.any,
              values: any.series,
              slot: OCCASION_SLOT.any,
              area: true,
            },
          ]}
          labels={labels}
          format="percent"
          height={200}
          markers={markers}
        />
      </Panel>

      <Panel
        title="By kind"
        note="The same, for each kind. A rule fixing one kind can move another: guest appearances give way whenever an intro, Q&A, conversation or panel is found."
      >
        <LineChart
          series={each.map((kind) => ({
            key: kind.kind,
            label: OCCASION_LABEL[kind.kind],
            values: kind.series,
            slot: OCCASION_SLOT[kind.kind],
          }))}
          labels={labels}
          format="percent"
          height={240}
          markers={markers}
        />
      </Panel>

      <Panel
        title="Occasions naming who is involved"
        note="Of the performances with an occasion, the share naming a guest or performer. The rules leave out a name they can't be sure of, so this falls when a change starts dropping names and rises when one starts reading something else as a name."
      >
        <LineChart
          series={[
            {
              key: "named",
              label: "Naming someone",
              values: named.series,
              slot: 3,
              area: true,
            },
          ]}
          labels={labels}
          format="percent"
          height={180}
          markers={markers}
        />
      </Panel>

      <Panel
        id="rules"
        title="Rule changes"
        note="Commits to common/occasions.js in clusterflick/scripts. Every transform installs the scripts fresh, so a merged change first shows in the next release - which is where the charts draw it."
        flush={rules.length > 0}
      >
        {rules.length > 0 ? (
          <div className={styles.scroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Change</th>
                  <th className={styles.right}>Merged</th>
                  <th className={styles.right}>First release</th>
                </tr>
              </thead>
              <tbody>
                {[...rules].reverse().map((rule) => (
                  <tr key={rule.sha}>
                    <td>
                      <a href={rule.url}>{rule.message}</a>
                      <div className={styles.subFigure}>
                        {rule.sha.slice(0, 7)}
                      </div>
                    </td>
                    <td className={styles.right}>
                      {dateTimeLabel(rule.committedAt)}
                    </td>
                    <td className={styles.right}>
                      {dateTimeLabel(releases[rule.releaseIndex].publishedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={styles.allClear}>
            The rules have not changed over these {window.days} days.
          </p>
        )}
      </Panel>

      <Panel
        title="Sources"
        note="Chains first, then venues by how much they have on. Each cell is the occasion's share of that source's performances now, over its history. Two sources pass occasions as structured tags (Indy Cinema Group and Riverside Studios); every other one is read from the listing's words."
        flush
      >
        <SourcesTable
          sources={sources}
          keys={kinds.map((kind) => kind.kind)}
          label={OCCASION_LABEL}
          short={OCCASION_SHORT}
          slot={OCCASION_SLOT}
        />
      </Panel>

      <Panel title="How a flag is raised">
        <ul className={styles.method}>
          <li>
            The method is the accessibility trend&apos;s. <strong>Now</strong>{" "}
            is the last {window.recentDays} days pooled; <strong>usual</strong>{" "}
            is the median share before the last {window.baselineGapDays} days.
          </li>
          <li>
            <strong>Gone</strong>: on nothing now, having been there in most
            earlier releases. <strong>Fallen</strong>: under about a third of
            usual. Either way only where usual would put at least five in the
            latest release - which most single venues don&apos;t reach for any
            one kind, so &ldquo;any occasion&rdquo; and the chains carry most of
            the signal.
          </li>
          <li>
            <strong>Appeared</strong>: all but absent before, now on a tenth of
            the programme or more - half the accessibility bar, since an
            occasion on a tenth of a programme is far rarer than a subtitle.
          </li>
          <li>
            The trend starts at the first release carrying occasions. A release
            before then carries none, which would read as every occasion having
            gone.
          </li>
          <li>
            This cannot see an occasion a venue has never had read, or one the
            rules have always missed. It only notices change.
          </li>
        </ul>
      </Panel>
    </>
  );
}
