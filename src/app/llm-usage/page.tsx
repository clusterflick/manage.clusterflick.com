import Panel from "@/components/panel";
import PageHeader from "@/components/page-header";
import StatTile from "@/components/stat-tile";
import StatGrid from "@/components/stat-tile/grid";
import LineChart from "@/components/charts/line-chart";
import StackedBars from "@/components/charts/stacked-bars";
import { llm } from "@/lib/reports";
import {
  compactCount,
  count,
  dateLabel,
  money,
  percent,
  signedPercent,
  timeLabel,
} from "@/lib/format";
import styles from "./page.module.scss";

export const metadata = { title: "LLM usage — Clusterflick manage" };

export default function LlmUsagePage() {
  if (llm.empty) {
    return (
      <>
        <PageHeader title="LLM usage" lede="No usage rows have been collected yet." />
      </>
    );
  }

  const dayLabels = llm.days.map((day) => dateLabel(`${day.date}T12:00:00Z`));

  // Slots assigned by call site in a fixed order and held there, so filtering
  // or a stage dropping out never repaints the others.
  const callSiteSlots = new Map(
    llm.callSites.map((site, index) => [site.name, (index % 8) + 1]),
  );

  // The runs that make up the most recent day, in the order they ran. The day
  // totals elsewhere on the page are sums of exactly these rows.
  const latestDayRuns = llm.runs.filter((run) => run.date === llm.latest.day.date);
  const latestDayCost = llm.latest.day.estimatedCostUsd;

  const stacked = llm.callSites.map((site) => ({
    key: site.name,
    label: site.name,
    slot: callSiteSlots.get(site.name)!,
    values: llm.days.map(
      (day) => site.byDay.find((entry) => entry.date === day.date)?.estimatedCostUsd ?? 0,
    ),
  }));

  return (
    <>
      <PageHeader
        title="LLM usage"
        lede="What the transform pipeline spends on the LLM and where it goes. The pipeline runs two to four times a day, so every figure here is a sum over a day's runs rather than a single run — a row read as a day would understate spend by however many runs it dropped."
        meta={
          <>
            {count(llm.window.runs)} transform runs across {llm.window.days} days,{" "}
            {llm.window.firstDate} to {llm.window.lastDate}
          </>
        }
      />

      <StatGrid>
        <StatTile
          label={`Spend on ${llm.latest.day.date}`}
          value={money(llm.latest.day.estimatedCostUsd)}
          detail={`${llm.latest.day.runs} ${llm.latest.day.runs === 1 ? "run" : "runs"} · ${count(llm.latest.day.calls)} calls`}
        />
        <StatTile
          label="Mean per day"
          value={money(llm.costPerDay.mean)}
          detail={`Median ${money(llm.costPerDay.median)} · p90 ${money(llm.costPerDay.p90)} · peak ${money(llm.costPerDay.max)}`}
        />
        <StatTile
          label="Week on week"
          value={signedPercent(llm.costPerDay.weekOnWeek)}
          detail={
            llm.costPerDay.weekOnWeek === null
              ? "Not enough history yet — needs two full weeks to compare."
              : "Last seven days against the seven before them."
          }
        />
        <StatTile
          label={`${llm.projection.month} projected`}
          value={money(llm.projection.projected)}
          detail={`${money(llm.projection.spentSoFar)} over ${llm.projection.daysSoFar} of ${llm.projection.daysInMonth} days, at the current daily rate`}
        />
      </StatGrid>

      <Panel
        title="Cost per day"
        note="A day's spend is the sum of its transform runs. The dashed line is the window mean."
      >
        <LineChart
          series={[
            {
              key: "cost",
              label: "Estimated cost",
              values: llm.days.map((day) => day.estimatedCostUsd),
              slot: 1,
              area: true,
            },
          ]}
          labels={dayLabels}
          format="money"
          reference={{ value: llm.costPerDay.mean, label: `mean ${money(llm.costPerDay.mean)}` }}
        />
      </Panel>

      <Panel
        title="Cache hit rate"
        note="The number that explains the cost above. A run with a cold cache costs several times what the same work costs warm, so a dip here and a spike there are the same event. The cache expires overnight, so each day's first run is always cold: the warm line leaves it out and is the one to watch; all runs is what the day actually paid for."
      >
        <LineChart
          series={[
            {
              key: "warmHitRate",
              label: "Warm runs",
              values: llm.days.map((day) => day.warmCacheHitRate),
              slot: 3,
            },
            {
              key: "hitRate",
              label: "All runs",
              values: llm.days.map((day) => day.cacheHitRate),
              slot: 1,
            },
          ]}
          labels={dayLabels}
          format="percent"
        />
      </Panel>

      <Panel
        title="Cost by call site"
        note="Each day's spend split by the stage that made the call. This is what says whether a rise came from more listings needing the LLM or from one stage losing its cache."
      >
        <StackedBars
          series={stacked}
          labels={dayLabels}
          format="money"
        />
      </Panel>

      <Panel
        title="Call sites over the window"
        note="Totals across every run collected. Cost per thousand calls is the figure to compare stages by — a stage making many cheap cached calls is not the one to look at first, and a per-call figure would round to zero for all of them."
        flush
      >
        <div className={styles.scroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Call site</th>
                <th className={styles.right}>Calls</th>
                <th className={styles.right}>Cache misses</th>
                <th className={styles.right}>Miss rate</th>
                <th className={styles.right}>Cost</th>
                <th className={styles.right}>Per 1k calls</th>
              </tr>
            </thead>
            <tbody>
              {llm.callSites.map((site) => (
                <tr key={site.name}>
                  <td>
                    <span
                      className={styles.swatch}
                      style={{ background: `var(--series-${callSiteSlots.get(site.name)})` }}
                      aria-hidden="true"
                    />
                    <span className="mono">{site.name}</span>
                  </td>
                  <td className={styles.right}>{count(site.calls)}</td>
                  <td className={styles.right}>{count(site.cacheMisses)}</td>
                  <td className={styles.right}>{percent(site.missRate, 1)}</td>
                  <td className={styles.right}>{money(site.estimatedCostUsd)}</td>
                  <td className={styles.right}>{money(site.costPerThousandCalls)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        title={`Runs on ${llm.latest.day.date}`}
        note="One row per transform run on the most recent day in the log, in the order they ran — which is today, on a site built after the day's first run. The first run of a day always starts on a cold cache, so it pays for work the rest of the day gets back for a fraction of the price; a run that follows a retrieve has new listings to read and costs more than one that follows nothing."
        flush
      >
        <div className={styles.scroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Run</th>
                <th className={styles.right}>Calls</th>
                <th className={styles.right}>Cached</th>
                <th className={styles.right}>Prompt tokens</th>
                <th className={styles.right}>Cost</th>
                <th className={styles.right}>Share of day</th>
                <th className={styles.right}>Venues on LLM</th>
              </tr>
            </thead>
            <tbody>
              {latestDayRuns.map((run, index) => (
                <tr key={run.runId}>
                  <td className={styles.strong}>
                    {run.at ? timeLabel(run.at) : `Run ${index + 1}`}
                    {index === 0 && <span className={styles.tag}>cold cache</span>}
                  </td>
                  <td className={styles.right}>{count(run.calls)}</td>
                  <td className={styles.right}>{percent(run.cacheHitRate, 1)}</td>
                  <td className={styles.right}>{compactCount(run.promptTokens)}</td>
                  <td className={styles.right}>{money(run.estimatedCostUsd)}</td>
                  <td className={styles.right}>
                    {latestDayCost > 0
                      ? percent(run.estimatedCostUsd / latestDayCost, 0)
                      : "—"}
                  </td>
                  <td className={styles.right}>
                    {count(run.venuesWithLlmUsage)} of {count(run.venueCount)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className={styles.strong}>
                  {latestDayRuns.length} {latestDayRuns.length === 1 ? "run" : "runs"}
                </td>
                <td className={styles.right}>{count(llm.latest.day.calls)}</td>
                <td className={styles.right}>{percent(llm.latest.day.cacheHitRate, 1)}</td>
                <td className={styles.right}>{compactCount(llm.latest.day.promptTokens)}</td>
                <td className={styles.right}>{money(latestDayCost)}</td>
                <td className={styles.right}>100%</td>
                <td className={styles.right}>—</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Panel>

      <Panel
        title="By month"
        note="One row per month in the window. Cost per day is the fair comparison between a finished month and one still running."
        flush
      >
        <div className={styles.scroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Month</th>
                <th className={styles.right}>Days</th>
                <th className={styles.right}>Runs</th>
                <th className={styles.right}>Calls</th>
                <th className={styles.right}>Cached</th>
                <th className={styles.right}>Prompt tokens</th>
                <th className={styles.right}>Cost</th>
                <th className={styles.right}>Per day</th>
              </tr>
            </thead>
            <tbody>
              {llm.months.map((month) => (
                <tr key={month.month}>
                  <td className={styles.strong}>{month.month}</td>
                  <td className={styles.right}>{month.days}</td>
                  <td className={styles.right}>{count(month.runs)}</td>
                  <td className={styles.right}>{count(month.calls)}</td>
                  <td className={styles.right}>{percent(month.cacheHitRate, 1)}</td>
                  <td className={styles.right}>{compactCount(month.promptTokens)}</td>
                  <td className={styles.right}>{money(month.estimatedCostUsd)}</td>
                  <td className={styles.right}>{money(month.costPerDay)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        title="Biggest prompts"
        note="Only the single largest prompt per run is logged, so this is a tally of which venues turn up as the worst offender — not a ranking of every venue's prompt size. A venue here is one whose listings page is large enough to be worth trimming before it reaches the model."
        flush
      >
        <div className={styles.scroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Venue</th>
                <th className={styles.right}>Largest prompt</th>
                <th className={styles.right}>Runs topped</th>
                <th>Call sites</th>
              </tr>
            </thead>
            <tbody>
              {llm.largestPrompts.map((entry) => (
                <tr key={entry.venueId}>
                  <td className={`${styles.strong} mono`}>{entry.venueId}</td>
                  <td className={styles.right}>
                    {compactCount(entry.maxPromptChars)} chars
                  </td>
                  <td className={styles.right}>{entry.appearances}</td>
                  <td className="mono">{entry.callSites.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        title="Venue coverage"
        note="How many of the venues in a transform run needed the LLM at all. The rest were handled by the deterministic parsers."
      >
        <p className={styles.coverageLine}>
          On the most recent run, <strong>{llm.latest.venuesWithLlmUsage}</strong> of{" "}
          <strong>{llm.latest.venueCount}</strong> venues needed the LLM —{" "}
          {percent(llm.latest.venuesWithLlmUsage / llm.latest.venueCount, 0)} of the
          pipeline.
        </p>
      </Panel>
    </>
  );
}
