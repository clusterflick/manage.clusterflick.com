import type { OccasionKey } from "@/lib/reports";

export const OCCASION_LABEL: Record<OccasionKey, string> = {
  any: "Any occasion",
  intro: "Intro",
  qAndA: "Q&A",
  inConversation: "In conversation",
  panel: "Panel",
  guestAppearance: "Guest appearance",
  liveScore: "Live score",
  premiere: "Premiere",
  preview: "Preview",
};

// Short enough for a column header in the sources table.
export const OCCASION_SHORT: Record<OccasionKey, string> = {
  any: "Any",
  intro: "Intro",
  qAndA: "Q&A",
  inConversation: "Conv.",
  panel: "Panel",
  guestAppearance: "Guest",
  liveScore: "Score",
  premiere: "Prem.",
  preview: "Preview",
};

// One palette slot per kind, held fixed across every chart on the page. There
// are eight slots and nine keys; "any" is drawn on a chart of its own, so it
// shares slot 1 with nothing it is ever shown beside except in the table.
export const OCCASION_SLOT: Record<OccasionKey, number> = {
  any: 1,
  intro: 1,
  qAndA: 2,
  inConversation: 3,
  panel: 4,
  guestAppearance: 5,
  liveScore: 6,
  premiere: 7,
  preview: 8,
};
