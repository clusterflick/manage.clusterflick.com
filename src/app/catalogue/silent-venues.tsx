"use client";

import { useState } from "react";
import type { CatalogueReport, SilentVenue } from "@/lib/reports";
import { count } from "@/lib/format";
import styles from "./page.module.scss";

type Silent = CatalogueReport["silentVenues"];

// The groups in the order they matter, each with the sentence that says how to
// read an empty one. Without these the four that matter are indistinguishable
// from the hundred and thirty that do not.
const GROUPS: {
  key: keyof Omit<Silent, "total">;
  label: string;
  meaning: string;
  open: boolean;
}[] = [
  {
    key: "cinemas",
    label: "Cinemas",
    meaning:
      "Programme films full time, so an empty one usually means retrieval has stopped producing — though a seasonal or outdoor cinema out of season will show up here too.",
    open: true,
  },
  {
    key: "venues",
    label: "Venues that also programme film",
    meaning: "Worth a look, but not necessarily broken.",
    open: true,
  },
  {
    key: "unknown",
    label: "Unclassified",
    meaning: "No programming type recorded, so there is nothing to read this against.",
    open: true,
  },
  {
    key: "hosts",
    label: "Occasional hosts",
    meaning:
      "Community centres, pubs, parks, places of worship. They put on the occasional screening; empty is their normal state and almost never a fault.",
    open: false,
  },
];

function VenueRows({ venues }: { venues: SilentVenue[] }) {
  return (
    <div className={styles.scroll}>
      <table className={styles.coverage}>
        <thead>
          <tr>
            <th>Venue</th>
            <th>Type</th>
          </tr>
        </thead>
        <tbody>
          {venues.map((venue) => (
            <tr key={venue.id}>
              <td className={styles.fieldName}>
                {venue.url ? (
                  <a href={venue.url} target="_blank" rel="noreferrer">
                    {venue.name}
                  </a>
                ) : (
                  venue.name
                )}
                <div className={`${styles.categories} mono`}>{venue.id}</div>
              </td>
              <td>{venue.type ?? <span className={styles.muted}>—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function SilentVenues({ silent }: { silent: Silent }) {
  // The host list is long and rarely the reason anyone opened this panel, so it
  // starts closed rather than pushing everything else off the screen.
  const [open, setOpen] = useState<string[]>(
    GROUPS.filter((group) => group.open).map((group) => group.key),
  );

  const toggle = (key: string) =>
    setOpen((current) =>
      current.includes(key)
        ? current.filter((entry) => entry !== key)
        : [...current, key],
    );

  return (
    <div>
      {GROUPS.map((group) => {
        const venues = silent[group.key];
        if (!venues.length) return null;
        const isOpen = open.includes(group.key);
        return (
          <section key={group.key} className={styles.silentGroup}>
            <button
              type="button"
              className={styles.silentHeader}
              onClick={() => toggle(group.key)}
              aria-expanded={isOpen}
            >
              <span className={styles.silentToggle} aria-hidden="true">
                {isOpen ? "▾" : "▸"}
              </span>
              <span className={styles.silentLabel}>
                {group.label}
                <span className={styles.silentCount}>{count(venues.length)}</span>
              </span>
              <span className={styles.silentMeaning}>{group.meaning}</span>
            </button>
            {isOpen && <VenueRows venues={venues} />}
          </section>
        );
      })}
    </div>
  );
}
