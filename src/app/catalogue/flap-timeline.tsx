import type { FlappingFilm, FlappingRelease } from "@/lib/reports";
import { dateTimeLabel } from "@/lib/format";
import styles from "./page.module.scss";

// One cell per release, oldest on the left. Films are lettered as well as
// coloured, because colour alone never carries the meaning on this site.
export const filmLetter = (index: number) => String.fromCharCode(65 + index);

const runLabel = (release: FlappingRelease) =>
  `${release.tag} · ${dateTimeLabel(release.publishedAt)}`;

export function MatchTimeline({
  timeline,
  films,
  releases,
}: {
  timeline: (number | null)[];
  films: FlappingFilm[];
  releases: FlappingRelease[];
}) {
  return (
    <span className={styles.timeline}>
      {timeline.map((index, run) => {
        const film = index === null ? null : films[index];
        return (
          <span
            key={releases[run].tag}
            className={
              film === null
                ? styles.cellAbsent
                : `${styles.cellFilm} ${film.matched ? "" : styles.cellUnmatched}`
            }
            // An unmatched film is drawn hollow: the listing had no match
            // in that run, which is the thing worth seeing at a glance.
            style={
              film === null
                ? undefined
                : film.matched
                  ? { background: `var(--series-${(index! % 8) + 1})` }
                  : { borderColor: `var(--series-${(index! % 8) + 1})` }
            }
            title={`${runLabel(releases[run])} — ${
              film === null
                ? "not listed"
                : `${filmLetter(index!)}: ${film.title}${film.matched ? "" : " (unmatched)"}`
            }`}
          >
            {index === null ? "" : filmLetter(index)}
          </span>
        );
      })}
    </span>
  );
}

export function PresenceTimeline({
  timeline,
  releases,
}: {
  timeline: ("in" | "out" | null)[];
  releases: FlappingRelease[];
}) {
  return (
    <span className={styles.timeline}>
      {timeline.map((state, run) => (
        <span
          key={releases[run].tag}
          className={
            state === "in"
              ? styles.cellIn
              : state === "out"
                ? styles.cellOut
                : styles.cellAbsent
          }
          title={`${runLabel(releases[run])} — ${
            state === "in"
              ? "listed"
              : state === "out"
                ? "missing with performances still to come"
                : "not listed"
          }`}
        >
          {state === "out" ? "×" : ""}
        </span>
      ))}
    </span>
  );
}
