import type { ShareFlagKind } from "@/lib/reports";
import type { Severity } from "@/lib/status";

export const KIND_LABEL: Record<ShareFlagKind, string> = {
  gone: "gone",
  fall: "fallen",
  new: "new",
};

// A share that has appeared is worth a look - a mapping or rule that started
// over-matching looks the same as one that started working - but it is not a
// loss.
export const KIND_SEVERITY: Record<ShareFlagKind, Severity> = {
  gone: "critical",
  fall: "serious",
  new: "warning",
};
