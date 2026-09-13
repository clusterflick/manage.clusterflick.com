import type { ReactNode } from "react";
import styles from "./grid.module.scss";

// Auto-fit rather than a fixed column count, so the row reflows to one column
// on a phone without a breakpoint per layout.
export default function StatGrid({ children }: { children: ReactNode }) {
  return <div className={styles.grid}>{children}</div>;
}
