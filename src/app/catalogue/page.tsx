import Panel from "@/components/panel";
import PageHeader from "@/components/page-header";
import StatTile from "@/components/stat-tile";
import StatGrid from "@/components/stat-tile/grid";
import Meter from "@/components/meter";
import MovieTable from "./movie-table";
import CoverageTable from "./coverage-table";
import VenueMissTable from "./venue-miss-table";
import SilentVenues from "./silent-venues";
import ResolvedTable from "./resolved-table";
import NormaliserTable from "./normaliser-table";
import { MatchFlapTable, PresenceFlapTable } from "./flapping-tables";
import { catalogue } from "@/lib/reports";
import { rateStatus } from "@/lib/status";
import { count, dateTimeLabel, percent } from "@/lib/format";
import styles from "./page.module.scss";

export const metadata = { title: "Catalogue — Clusterflick manage" };

export default function CataloguePage() {
  const {
    totals,
    matching,
    fieldCoverage,
    ratingCoverage,
    byCategory,
    normaliser,
    flapping,
  } = catalogue;
  const flapWindow = flapping.releases.length
    ? `the last ${count(flapping.releases.length)} data-combined releases, ${dateTimeLabel(flapping.releases[0].publishedAt)} to ${dateTimeLabel(flapping.releases.at(-1)!.publishedAt)}`
    : "no data-combined releases";
  const posters = fieldCoverage.find((field) => field.key === "posterPath");

  return (
    <>
      <PageHeader
        title="Catalogue"
        meta={
          <>
            data-combined <span className="mono">{catalogue.release.combined.tag}</span>,
            generated {dateTimeLabel(catalogue.generatedAt)} · data-matched{" "}
            <span className="mono">{catalogue.release.matched.tag}</span>
          </>
        }
      />

      <StatGrid>
        <StatTile
          label="Film match rate"
          value={percent(matching.filmMatchRate, 1)}
          detail={`${count(totals.filmListings - matching.unmatchedFilms)} of ${count(totals.filmListings)} film listings matched`}
          severity={rateStatus(matching.filmMatchRate)}
        />
        <StatTile
          label="Unmatched films"
          value={count(matching.unmatchedFilms)}
          detail="Categorised as a film, and neither matched outright nor resolved into parts. These are the real misses."
        />
        <StatTile
          label="Resolved into parts"
          value={count(matching.resolvedFilms + matching.resolvedNonFilms)}
          detail={`${count(matching.resolvedFilms)} multi-film listings and ${count(matching.resolvedNonFilms)} shorts programmes that matched as several films rather than one`}
          href="#resolved"
        />
        <StatTile
          label="Unmatched non-films"
          value={count(matching.unmatchedNonFilms)}
          detail="Shorts, talks, events, music, quizzes. Expected — there is no film to match."
        />
        <StatTile
          label="Flapping listings"
          value={count(flapping.match.listings)}
          detail={`Flipped back to a film they had already left, over the last ${count(flapping.releases.length)} releases. ${count(flapping.presence.listings)} more dropped out and came back.`}
          severity={flapping.match.listings > 0 ? "warning" : "good"}
          href="#flapping"
        />
        <StatTile
          label="Poster coverage"
          value={percent(posters?.coverage, 1)}
          detail={`${count((posters?.total ?? 0) - (posters?.present ?? 0))} matched movies render as a blank`}
          severity={rateStatus(posters?.coverage)}
        />
      </StatGrid>

      <Panel
        id="unmatched"
        title={`${count(matching.unmatchedFilms)} unmatched film listings`}
        note="Listings whose showings are categorised as a film or a multi-film programme, with no match. Sorted by what screens soonest — those are the ones still worth fixing."
        flush
      >
        <MovieTable
          movies={catalogue.unmatchedFilms}
          emptyMessage="Every film listing matched."
        />
      </Panel>

      <Panel
        id="resolved"
        title={`${count(catalogue.resolved.length)} listings resolved into their parts`}
        note={
          <>
            Double bills, marathons and shorts blocks have no single film to
            resolve to, so the wrapper entry carries{" "}
            <span className="mono">isUnmatched</span> while the match sits in{" "}
            <span className="mono">includedMovies</span> — a list of fully
            resolved films, each with its own TMDB id, poster and metadata. These
            are matches, and the rate above counts them as such. A part shown
            underlined has no poster of its own.
          </>
        }
        flush
      >
        <ResolvedTable listings={catalogue.resolved} />
      </Panel>

      <Panel
        id="normaliser"
        title={`${count(normaliser.pairs.length)} titles the normaliser couldn't line up`}
        note={
          <>
            Matched listings whose title normalises differently from the TMDB
            title they matched, so the match took the LLM rather than a title
            comparison. {count(normaliser.mismatched)} of{" "}
            {count(normaliser.checked)} matched listings in data-transformed{" "}
            <span className="mono">{normaliser.source.transformed.tag}</span>,
            normalised with scripts{" "}
            <span className="mono">{normaliser.source.scripts.sha.slice(0, 7)}</span>.
          </>
        }
        flush
      >
        <NormaliserTable pairs={normaliser.pairs} />
      </Panel>

      <Panel
        id="flapping"
        title={`${count(flapping.match.listings)} listings flapping between matches`}
        note={
          <>
            Venue listings that sat under one film, then another, then the
            first again — across {flapWindow}. Moving once is a rematch and
            fine; coming back is the matcher unable to decide, and the site
            showing a different film from one run to the next. Moving in and
            out of a match counts too, drawn hollow. Grouped by the films
            involved, since one title usually flaps at every venue listing it
            at once; the timeline is the listing that switched most, and the
            rest are under the toggle. Hover a cell for its release.
          </>
        }
        flush
      >
        <MatchFlapTable groups={flapping.match.groups} releases={flapping.releases} />
      </Panel>

      <Panel
        id="flapping-presence"
        title={`${count(flapping.presence.listings)} listings dropping out and coming back`}
        note={
          <>
            Venue listings missing from a release between two they were in,
            while they still had performances to come — across {flapWindow}. A
            listing whose last performance has passed drops out on its own and
            comes back under the same id when the venue adds a date, as a
            monthly event does, so those gaps are left out. Marked × where it
            went missing with dates ahead; blank where it wasn’t listed for any
            other reason. Grouped by film.
          </>
        }
        flush
      >
        <PresenceFlapTable
          groups={flapping.presence.groups}
          releases={flapping.releases}
        />
      </Panel>

      <Panel
        id="coverage"
        title="Field coverage on matched movies"
        note="Of the movies that did match, how many carry each field. A matched movie missing its poster or overview is a partial match — a different job from an unmatched title, and one the matcher will not retry on its own."
        flush
      >
        <CoverageTable fields={fieldCoverage} />
      </Panel>

      <Panel
        title="Rating provider coverage"
        note="How many matched movies each provider has a record for. Low coverage is not necessarily a fault — Bechdel and Metacritic simply hold fewer titles than IMDb does."
        flush
      >
        <div className={styles.scroll}>
          <table className={styles.coverage}>
            <thead>
              <tr>
                <th>Provider</th>
                <th className={styles.right}>Matched</th>
                <th className={styles.right}>Coverage</th>
                <th className={styles.meterCol}>
                  <span className="visually-hidden">Coverage bar</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {ratingCoverage.map((provider) => (
                <tr key={provider.key}>
                  <td className={styles.fieldName}>{provider.label}</td>
                  <td className={styles.right}>
                    {count(provider.present)} / {count(provider.total)}
                  </td>
                  <td className={styles.right}>{percent(provider.coverage, 1)}</td>
                  <td className={styles.meterCol}>
                    <Meter
                      value={provider.coverage}
                      label={`${provider.label}: ${percent(provider.coverage, 1)} of matched movies`}
                      slot={3}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        id="venues"
        title="Miss rate by venue"
        note="Film listings only, so a music venue that lists nothing but gigs does not appear as broken. Ordered by how many listings are actually going unmatched rather than by rate — one miss out of one showing is 100% and says nothing."
        flush
      >
        <VenueMissTable venues={catalogue.byVenue} />
      </Panel>

      <Panel
        title="Listing categories"
        note="Every movie entry grouped by the categories its showings carry, with how many of each group went unmatched. This is the breakdown the headline match rate is derived from."
        flush
      >
        <div className={styles.scroll}>
          <table className={styles.coverage}>
            <thead>
              <tr>
                <th>Categories</th>
                <th className={styles.right}>Entries</th>
                <th className={styles.right}>Resolved to parts</th>
                <th className={styles.right}>Unmatched</th>
                <th className={styles.right}>Share</th>
              </tr>
            </thead>
            <tbody>
              {byCategory.map((group) => (
                <tr key={group.categories}>
                  <td className={styles.fieldName}>{group.categories}</td>
                  <td className={styles.right}>{count(group.total)}</td>
                  <td className={styles.right}>
                    {group.resolved === 0 ? (
                      <span className={styles.muted}>—</span>
                    ) : (
                      count(group.resolved)
                    )}
                  </td>
                  <td className={styles.right}>{count(group.unmatched)}</td>
                  <td className={styles.right}>
                    {percent(group.unmatched / group.total, 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        id="silent"
        title="Venues with no listings"
        note="Known venues carrying nothing in this release, split by what the venue is for — “no listings” means opposite things either side of that line. A cinema is always showing something, so an empty one usually means its retrieval has stopped producing. The host venues are community centres, pubs, parks and churches that put on an occasional screening; empty is their normal state, and they are listed last only for completeness."
        flush
      >
        <SilentVenues silent={catalogue.silentVenues} />
      </Panel>

      <Panel
        title={`Unmatched non-film listings`}
        note={`The ${count(matching.unmatchedNonFilms)} entries whose showings are all talks, shorts, events, music, quizzes or TV. These are expected to be unmatched; they are here so a film miscategorised as an event is findable. Showing the ${count(catalogue.unmatchedOther.length)} with the most performances.`}
        flush
      >
        <MovieTable movies={catalogue.unmatchedOther} showNext={false} />
      </Panel>
    </>
  );
}
