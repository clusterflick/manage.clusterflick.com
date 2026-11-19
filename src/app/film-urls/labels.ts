import type { LostUrl, LostUrlKind } from "@/lib/reports";
import type { Severity } from "@/lib/status";

const SITE = "https://clusterflick.com";

export const siteUrl = (path: string) => `${SITE}${path}`;

export const KIND_LABEL: Record<LostUrlKind, string> = {
  lost: "Film lost its page",
  retitled: "Retitled",
  listing: "Listing went",
  pruned: "Departed page pruned",
  unknown: "Can't tell",
};

export const KIND_DETAIL: Record<LostUrlKind, string> = {
  lost: "A showing film left without the departed page it should have. A fault upstream.",
  retitled: "Still a page, under a new slug.",
  listing:
    "An unmatched listing that finished, was retitled or got matched to a film.",
  pruned:
    "A departed film the seen registry forgot, a year after it was last listed.",
  unknown:
    "Compared against a map built before it said which films were departed or unmatched.",
};

export const KIND_ORDER: LostUrlKind[] = [
  "lost",
  "retitled",
  "listing",
  "pruned",
  "unknown",
];

const RULE_LABEL = {
  id: "by id",
  "title-hash": "matched listing",
  slug: "by title",
  "fuzzy-slug": "by close title",
} as const;

const REASON_LABEL = {
  "no-match": "nothing like it showing",
  ambiguous: "several films match",
  canonical: "its own page is a 404",
  "not-a-page": "not a page",
} as const;

// "301 by id", "404 · nothing like it showing".
export function outcomeLabel(url: LostUrl): string {
  return url.outcome === "redirect"
    ? `${url.status} ${RULE_LABEL[url.rule]}`
    : `404 · ${REASON_LABEL[url.reason]}`;
}

export function outcomeSeverity(url: LostUrl): Severity {
  if (url.kind === "lost") return "critical";
  if (url.outcome === "redirect")
    return url.status === 301 ? "good" : "warning";
  return url.review ? "serious" : "good";
}

// The byOutcome keys data-analysed writes ("302 fuzzy-slug", "404 no-match"),
// read the way the tables say them.
export function outcomeKeyLabel(key: string): string {
  const [status, detail] = key.split(" ");
  if (status === "404") {
    return `404 · ${REASON_LABEL[detail as keyof typeof REASON_LABEL] ?? detail}`;
  }
  return `${status} ${RULE_LABEL[detail as keyof typeof RULE_LABEL] ?? detail}`;
}
