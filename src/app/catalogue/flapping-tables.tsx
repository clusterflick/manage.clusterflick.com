"use client";

import DataTable, { type Column } from "@/components/data-table";
import type {
  FlappingFilm,
  FlappingRelease,
  MatchFlapGroup,
  PresenceFlapGroup,
} from "@/lib/reports";
import { count, dateTimeLabel } from "@/lib/format";
import { MatchTimeline, PresenceTimeline, filmLetter } from "./flap-timeline";
import styles from "./page.module.scss";

const venueNames = (venues: { name: string }[]) =>
  venues.map((venue) => venue.name).join(", ");

function FilmTitle({ film }: { film: FlappingFilm }) {
  return film.url ? (
    <a href={film.url} target="_blank" rel="noreferrer">
      {film.title}
    </a>
  ) : (
    <>{film.title}</>
  );
}

function VenuesCell({ venues, listings }: { venues: { name: string }[]; listings: number }) {
  return (
    <div>
      <span className={styles.venues}>{venueNames(venues)}</span>
      {listings > 1 && <div className={styles.categories}>{count(listings)} listings</div>}
    </div>
  );
}

// Listings that sat under one film, then another, then the first again.
export function MatchFlapTable({
  groups,
  releases,
}: {
  groups: MatchFlapGroup[];
  releases: FlappingRelease[];
}) {
  const columns: Column<MatchFlapGroup>[] = [
    {
      key: "films",
      header: "Films it flips between",
      sortValue: (group) => group.films[0].title.toLowerCase(),
      render: (group) => (
        <div className={styles.films}>
          {group.films.map((film, index) => (
            <span key={film.id} className={styles.film}>
              <span className={styles.filmKey}>{filmLetter(index)}</span>
              <span>
                <FilmTitle film={film} />
                {!film.matched && <span className={styles.year}>unmatched</span>}
              </span>
            </span>
          ))}
        </div>
      ),
    },
    {
      key: "kind",
      header: "Flips",
      width: "150px",
      sortValue: (group) => group.kind,
      render: (group) => <span className={styles.kind}>{group.kind}</span>,
    },
    {
      key: "timeline",
      header: "Each release, oldest first",
      render: (group) => (
        <MatchTimeline
          timeline={group.listings[0].timeline}
          films={group.films}
          releases={releases}
        />
      ),
    },
    {
      key: "switches",
      header: "Switches",
      align: "right",
      width: "90px",
      sortValue: (group) => group.switches,
      render: (group) => count(group.switches),
    },
    {
      key: "venues",
      header: "Venues",
      sortValue: (group) => group.listings.length,
      render: (group) => (
        <VenuesCell venues={group.venues} listings={group.listings.length} />
      ),
    },
    {
      key: "lastFlipAt",
      header: "Last flipped back",
      align: "right",
      width: "140px",
      sortValue: (group) => group.lastFlipAt ?? "",
      render: (group) => dateTimeLabel(group.lastFlipAt),
    },
  ];

  return (
    <DataTable
      rows={groups}
      columns={columns}
      rowKey={(group) => group.key}
      searchText={(group) =>
        `${group.films.map((film) => `${film.title} ${film.id}`).join(" ")} ${group.kind} ${venueNames(group.venues)}`
      }
      searchPlaceholder="Filter by film, venue or kind…"
      initialSort={{ key: "lastFlipAt", direction: "desc" }}
      emptyMessage="No listing flipped back to a film it had already left."
      // The row's timeline is the listing that switched most; the rest are
      // here, one per venue listing.
      renderExpanded={(group) =>
        group.listings.length < 2 ? null : (
          <ul className={styles.flapListings}>
            {group.listings.map((listing) => (
              <li key={listing.id} className={styles.flapListing}>
                <span>
                  {listing.venue.name}
                  <span className={`${styles.categories} mono`}> {listing.id}</span>
                </span>
                <MatchTimeline
                  timeline={listing.timeline}
                  films={group.films}
                  releases={releases}
                />
                <span className={styles.muted}>{count(listing.switches)} switches</span>
              </li>
            ))}
          </ul>
        )
      }
    />
  );
}

// Listings that dropped out of a release and came back in a later one.
export function PresenceFlapTable({
  groups,
  releases,
}: {
  groups: PresenceFlapGroup[];
  releases: FlappingRelease[];
}) {
  const columns: Column<PresenceFlapGroup>[] = [
    {
      key: "film",
      header: "Film",
      sortValue: (group) => group.film.title.toLowerCase(),
      render: (group) => (
        <div className={styles.titleCell}>
          <FilmTitle film={group.film} />
          {!group.film.matched && <span className={styles.year}>unmatched</span>}
        </div>
      ),
    },
    {
      key: "timeline",
      header: "Each release, oldest first",
      render: (group) => (
        <PresenceTimeline timeline={group.listings[0].timeline} releases={releases} />
      ),
    },
    {
      key: "dropouts",
      header: "Drop-outs",
      align: "right",
      width: "100px",
      sortValue: (group) => group.dropouts,
      render: (group) => count(group.dropouts),
    },
    {
      key: "venues",
      header: "Venues",
      sortValue: (group) => group.listings.length,
      render: (group) => (
        <VenuesCell venues={group.venues} listings={group.listings.length} />
      ),
    },
    {
      key: "lastReturnAt",
      header: "Last came back",
      align: "right",
      width: "140px",
      sortValue: (group) => group.lastReturnAt ?? "",
      render: (group) => dateTimeLabel(group.lastReturnAt),
    },
  ];

  return (
    <DataTable
      rows={groups}
      columns={columns}
      rowKey={(group) => group.key}
      searchText={(group) =>
        `${group.film.title} ${group.film.id} ${venueNames(group.venues)} ${group.listings
          .map((listing) => listing.id)
          .join(" ")}`
      }
      searchPlaceholder="Filter by film or venue…"
      initialSort={{ key: "lastReturnAt", direction: "desc" }}
      emptyMessage="No listing dropped out of a release and came back."
      renderExpanded={(group) =>
        group.listings.length < 2 ? null : (
          <ul className={styles.flapListings}>
            {group.listings.map((listing) => (
              <li key={listing.id} className={styles.flapListing}>
                <span>
                  {listing.venue.name}
                  <span className={`${styles.categories} mono`}> {listing.id}</span>
                </span>
                <PresenceTimeline timeline={listing.timeline} releases={releases} />
                <span className={styles.muted}>
                  missing from {count(listing.missedRuns)}{" "}
                  {listing.missedRuns === 1 ? "release" : "releases"}
                </span>
              </li>
            ))}
          </ul>
        )
      }
    />
  );
}
