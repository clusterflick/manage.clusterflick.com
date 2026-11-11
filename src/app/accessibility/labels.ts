import type { AccessibilityFlagKind, AccessibilityTag } from "@/lib/reports";
import type { Severity } from "@/lib/status";

export const TAG_LABEL: Record<AccessibilityTag, string> = {
  audioDescription: "Audio description",
  babyFriendly: "Baby friendly",
  dogFriendly: "Dog friendly",
  hardOfHearing: "Hard of hearing",
  relaxed: "Relaxed",
  subtitled: "Subtitled",
};

// Short enough for a column header in the sources table.
export const TAG_SHORT: Record<AccessibilityTag, string> = {
  audioDescription: "AD",
  babyFriendly: "Baby",
  dogFriendly: "Dog",
  hardOfHearing: "HoH",
  relaxed: "Relaxed",
  subtitled: "Subtitled",
};

// One palette slot per tag, held fixed across every chart on the page.
export const TAG_SLOT: Record<AccessibilityTag, number> = {
  audioDescription: 1,
  subtitled: 2,
  hardOfHearing: 3,
  babyFriendly: 4,
  relaxed: 5,
  dogFriendly: 6,
};

export const KIND_LABEL: Record<AccessibilityFlagKind, string> = {
  gone: "gone",
  fall: "fallen",
  new: "new",
};

// A tag that has appeared is worth a look - a mapping that started
// over-matching looks the same as one that started working - but it is not a
// loss.
export const KIND_SEVERITY: Record<AccessibilityFlagKind, Severity> = {
  gone: "critical",
  fall: "serious",
  new: "warning",
};
