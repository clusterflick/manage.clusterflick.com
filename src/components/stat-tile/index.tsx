import type { ReactNode } from "react";
import StatusPill from "@/components/status-pill";
import type { Severity } from "@/lib/status";
import styles from "./index.module.scss";

type Props = {
  label: string;
  value: ReactNode;
  // What the number is measured against - the denominator, the window, the
  // caveat. A bare figure with no frame is the main way a tile misleads.
  detail?: ReactNode;
  severity?: Severity;
  severityLabel?: string;
  href?: string;
};

export default function StatTile({
  label,
  value,
  detail,
  severity,
  severityLabel,
  href,
}: Props) {
  const body = (
    <>
      <div className={styles.top}>
        <span className={styles.label}>{label}</span>
        {severity && <StatusPill severity={severity}>{severityLabel}</StatusPill>}
      </div>
      <div className={`${styles.value} numeric`}>{value}</div>
      {detail && <div className={styles.detail}>{detail}</div>}
    </>
  );

  if (href) {
    return (
      <a className={`${styles.tile} ${styles.linked}`} href={href}>
        {body}
      </a>
    );
  }
  return <div className={styles.tile}>{body}</div>;
}
