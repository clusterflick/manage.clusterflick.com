"use client";

import { useState } from "react";
import Meter from "@/components/meter";
import MovieTable from "./movie-table";
import type { FieldCoverage } from "@/lib/reports";
import { count, percent } from "@/lib/format";
import { rateStatus } from "@/lib/status";
import StatusPill from "@/components/status-pill";
import styles from "./page.module.scss";

// Coverage per field, with the missing rows one click away. Expanding in place
// rather than linking out: the question "which ones?" follows the number
// immediately, and a separate page would lose the comparison.
export default function CoverageTable({ fields }: { fields: FieldCoverage[] }) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div>
      <div className={styles.scroll}>
        <table className={styles.coverage}>
          <thead>
            <tr>
              <th>Field</th>
              <th className={styles.right}>Present</th>
              <th className={styles.right}>Missing</th>
              <th className={styles.right}>Coverage</th>
              <th className={styles.meterCol}>
                <span className="visually-hidden">Coverage bar</span>
              </th>
              <th />
            </tr>
          </thead>
          <tbody>
            {fields.map((field) => {
              const missing = field.total - field.present;
              const isOpen = open === field.key;
              return (
                <tr key={field.key}>
                  <td className={styles.fieldName}>{field.label}</td>
                  <td className={styles.right}>{count(field.present)}</td>
                  <td className={styles.right}>
                    {missing === 0 ? <span className={styles.muted}>—</span> : count(missing)}
                  </td>
                  <td className={styles.right}>
                    <StatusPill severity={rateStatus(field.coverage)}>
                      {percent(field.coverage, 1)}
                    </StatusPill>
                  </td>
                  <td className={styles.meterCol}>
                    <Meter
                      value={field.coverage}
                      label={`${field.label}: ${percent(field.coverage, 1)} of matched movies`}
                    />
                  </td>
                  <td className={styles.right}>
                    {missing > 0 && (
                      <button
                        type="button"
                        className={styles.linkButton}
                        onClick={() => setOpen(isOpen ? null : field.key)}
                        aria-expanded={isOpen}
                      >
                        {isOpen ? "Hide" : "Show"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {open && (
        <div className={styles.expansion}>
          {(() => {
            const field = fields.find((entry) => entry.key === open)!;
            const missing = field.total - field.present;
            return (
              <>
                <p className={styles.expansionNote}>
                  Matched movies with no <strong>{field.label.toLowerCase()}</strong>
                  {missing > field.examples.length
                    ? ` — the ${field.examples.length} with the most performances, of ${count(missing)}.`
                    : "."}
                </p>
                <MovieTable movies={field.examples} showNext={false} />
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
