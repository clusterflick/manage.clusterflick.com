import Panel from "@/components/panel";
import PageHeader from "@/components/page-header";
import StatTile from "@/components/stat-tile";
import StatGrid from "@/components/stat-tile/grid";
import StatusPill from "@/components/status-pill";
import StackedBars from "@/components/charts/stacked-bars";
import { movie404 } from "@/lib/reports";
import { count, dateLabel, dateTimeLabel } from "@/lib/format";
import {
  KIND_DETAIL,
  KIND_LABEL,
  KIND_ORDER,
  outcomeKeyLabel,
  outcomeLabel,
  outcomeSeverity,
  siteUrl,
} from "./labels";
import UrlsTable from "./urls-table";
import styles from "./page.module.scss";

export const metadata = { title: "Film URLs — Clusterflick manage" };

const deploysLabel = (n: number) =>
  `${count(n)} ${n === 1 ? "deploy" : "deploys"}`;

export default function FilmUrlsPage() {
  if (movie404.empty) {
    return (
      <PageHeader
        title="Film URLs"
        meta="No deploy has been compared yet. data-analysed's Film 404 Log keeps the first deploy's map as its baseline, and logs from the second."
      />
    );
  }

  const { window, totals, byKind, byOutcome, deploys, review, latest } =
    movie404;
  const labels = deploys.map((deploy) => dateTimeLabel(deploy.deployedAt));

  return (
    <>
      <PageHeader
        title="Film URLs"
        meta={
          <>
            The film URLs each deploy of clusterflick.com stopped serving, and
            what the movie-redirects Worker does with them now:{" "}
            {deploysLabel(window.deploys)} over the last {window.days} days (
            {dateLabel(window.firstAt)} to {dateLabel(window.lastAt)})
          </>
        }
      />

      <Panel
        id="review"
        title={
          review.length
            ? `${count(review.length)} ${review.length === 1 ? "URL needs" : "URLs need"} a look`
            : "Every lost URL went where it should"
        }
        note={
          <>
            A redirect by id or by a matched listing&apos;s old id is exact, and
            a finished listing with nothing like it showing is a 404 because
            that&apos;s the honest answer. What&apos;s listed here is what the
            rules can get wrong: a redirect made by title, which is worth
            checking lands on the right film; a slug several showing films
            share; and a showing film that left without a departed page, which
            should never happen.
          </>
        }
        actions={
          <StatusPill
            severity={
              totals.lostFilms ? "critical" : review.length ? "warning" : "good"
            }
          >
            {totals.lostFilms
              ? `${count(totals.lostFilms)} films lost`
              : review.length
                ? `${count(review.length)} to check`
                : "all clear"}
          </StatusPill>
        }
        flush={review.length > 0}
      >
        {review.length > 0 ? (
          <div className={styles.scroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>URL</th>
                  <th>Why</th>
                  <th>Now</th>
                  <th className={styles.right}>Deploy</th>
                </tr>
              </thead>
              <tbody>
                {review.map((url) => (
                  <tr key={`${url.deployedAt} ${url.path}`}>
                    <td>
                      <a href={siteUrl(url.path)} className={styles.path}>
                        {url.path}
                      </a>
                      <div className={styles.subFigure}>
                        {KIND_LABEL[url.kind]}
                      </div>
                    </td>
                    <td>{url.review}</td>
                    <td>
                      <StatusPill severity={outcomeSeverity(url)}>
                        {outcomeLabel(url)}
                      </StatusPill>
                      {url.outcome === "redirect" && (
                        <div className={styles.subFigure}>
                          →{" "}
                          <a
                            href={siteUrl(url.location)}
                            className={styles.path}
                          >
                            {url.location}
                          </a>
                        </div>
                      )}
                    </td>
                    <td className={styles.right}>
                      {dateTimeLabel(url.deployedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={styles.allClear}>
            Over {deploysLabel(window.deploys)}, every film URL that stopped
            being a page was redirected exactly or was a listing with nowhere to
            go.
          </p>
        )}
      </Panel>

      <StatGrid>
        <StatTile
          label="Film URLs lost"
          value={count(totals.lost)}
          detail={`Stopped being pages over ${deploysLabel(window.deploys)} in ${window.days} days`}
        />
        <StatTile
          label="Now redirected"
          value={count(totals.redirected)}
          detail="Sent on by the Worker, by id, by a matched listing's old id, or by title"
          severity="good"
        />
        <StatTile
          label="Left as a 404"
          value={count(totals.notFound)}
          detail="Mostly unmatched one-off events that have finished"
        />
        <StatTile
          label="Showing films lost"
          value={count(totals.lostFilms)}
          detail="Left without a departed page. Should always be none"
          severity={totals.lostFilms ? "critical" : "good"}
          severityLabel={totals.lostFilms ? "Check" : undefined}
        />
      </StatGrid>

      <Panel
        title="Per deploy"
        note="Each deploy's lost URLs, split by whether the Worker now redirects them. Several deploys a day is normal: the site is rebuilt for each data release."
      >
        <StackedBars
          series={[
            {
              key: "redirected",
              label: "Redirected",
              slot: 2,
              values: deploys.map((deploy) => deploy.redirected),
            },
            {
              key: "not-found",
              label: "404",
              slot: 1,
              values: deploys.map((deploy) => deploy.notFound),
            },
          ]}
          labels={labels}
          format="count"
        />
      </Panel>

      <div className={styles.twoUp}>
        <Panel title="Why they went" flush>
          <table className={styles.table}>
            <tbody>
              {KIND_ORDER.filter((kind) => byKind[kind]).map((kind) => (
                <tr key={kind}>
                  <td>
                    <span className={styles.sourceName}>
                      {KIND_LABEL[kind]}
                    </span>
                    <div className={styles.subFigure}>{KIND_DETAIL[kind]}</div>
                  </td>
                  <td className={styles.right}>{count(byKind[kind])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel title="Where they go now" flush>
          <table className={styles.table}>
            <tbody>
              {Object.entries(byOutcome).map(([key, value]) => (
                <tr key={key}>
                  <td>{outcomeKeyLabel(key)}</td>
                  <td className={styles.right}>{count(value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>

      <Panel
        title={`Latest deploy: ${dateTimeLabel(latest.deployedAt)}`}
        note={
          <>
            Against the deploy before it (
            {latest.generatedAt === latest.previousGeneratedAt
              ? `both from the retrieve of ${dateTimeLabel(latest.generatedAt)}, re-transformed`
              : `retrieved ${dateTimeLabel(latest.previousGeneratedAt)}, now ${dateTimeLabel(latest.generatedAt)}`}
            ): {count(latest.pages.previous)} → {count(latest.pages.current)}{" "}
            film pages, {count(latest.lost)} URLs lost,{" "}
            {count(latest.redirected)} now redirected
            {latest.shown < latest.lost
              ? `. The first ${count(latest.shown)} are shown.`
              : "."}
          </>
        }
        flush
      >
        <UrlsTable urls={latest.urls} />
      </Panel>

      <Panel title="How it's worked out">
        <ul className={styles.method}>
          <li>
            Every deploy publishes <code>/movie-urls.json</code>, each film page
            it built. data-analysed&apos;s Film 404 Log compares it with the
            last deploy&apos;s, so a URL is lost the deploy it stops being a
            page, whether or not anyone has followed it yet.
          </li>
          <li>
            Where it goes now is the Worker&apos;s own answer: the comparison
            runs the same module from <code>@clusterflick/catalogue</code> that
            the Worker does. A 301 is by id or by a matched listing&apos;s old
            id; a 302 is by title, to the one showing film under that slug or
            within 10% of a slug of 20 characters or more.
          </li>
          <li>
            Departed films keep their pages for a year after they were last
            listed, so a matched film that stops showing isn&apos;t lost - it
            becomes a departed page, and is only pruned a year later.
          </li>
        </ul>
      </Panel>
    </>
  );
}
