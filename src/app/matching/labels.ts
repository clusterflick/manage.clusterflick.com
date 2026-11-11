import type { MatchedFlagKind, MatchedSource } from "@/lib/reports";
import type { Severity } from "@/lib/status";

export const SOURCE_LABEL: Record<MatchedSource, string> = {
  bechdel: "Bechdel Test",
  imdb: "IMDb",
  letterboxd: "Letterboxd",
  metacritic: "Metacritic",
  moviedb: "TMDB",
  rottentomatoes: "Rotten Tomatoes",
};

// The figure each source is checked for: the one the website shows.
export const SCORE_LABEL: Record<MatchedSource, string> = {
  bechdel: "Bechdel rating",
  imdb: "IMDb rating",
  letterboxd: "Letterboxd rating",
  metacritic: "Metascore",
  moviedb: "TMDB rating",
  rottentomatoes: "Tomatometer",
};

// One palette slot per source, held fixed across both charts on the page.
export const SOURCE_SLOT: Record<MatchedSource, number> = {
  rottentomatoes: 1,
  letterboxd: 2,
  imdb: 3,
  metacritic: 4,
  moviedb: 5,
  bechdel: 6,
};

export const KIND_LABEL: Record<MatchedFlagKind, string> = {
  missing: "missing",
  unscored: "no scores",
  "scores-fell": "fewer scores",
  "matches-fell": "fewer matches",
};

export const KIND_SEVERITY: Record<MatchedFlagKind, Severity> = {
  missing: "critical",
  unscored: "critical",
  "scores-fell": "serious",
  "matches-fell": "serious",
};
