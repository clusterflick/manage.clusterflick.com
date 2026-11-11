// Display names and colours for the runner groups `runnerGroup` in
// scripts/lib/report-pipeline.mjs produces. Held fixed per machine so the
// chart and the table agree, and a group missing from a window doesn't
// repaint the others. A group not listed here shows under its key.
const GROUPS: Record<string, { label: string; slot: number }> = {
  macos: { label: "MacBook Pro", slot: 1 },
  pi4: { label: "Raspberry Pi 4", slot: 2 },
  "github-hosted": { label: "GitHub-hosted", slot: 3 },
  optiplex: { label: "OptiPlex 7080", slot: 7 },
  // The second OptiPlex, its runners named self-hosted-optiplex5090-N. A
  // machine of its own, so a line of its own rather than folded into the
  // first box's.
  optiplex5090: { label: "OptiPlex 5090", slot: 5 },
};

export const groupLabel = (key: string) => GROUPS[key]?.label ?? key;
export const groupSlot = (key: string) => GROUPS[key]?.slot ?? 8;

// Every Retrieve job is named "Retrieve <source>"; in a panel already titled
// for the flow, the prefix is noise.
export const shortJobName = (name: string) =>
  name.replace(/^(Retrieve|Transform) /, "");
