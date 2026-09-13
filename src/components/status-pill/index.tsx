import { SEVERITY_ICON, SEVERITY_LABEL, type Severity } from "@/lib/status";
import styles from "./index.module.scss";

type Props = {
  severity: Severity;
  // Overrides the default word for the state. The icon and a word are always
  // both present - status colour never carries the meaning by itself.
  children?: React.ReactNode;
};

export default function StatusPill({ severity, children }: Props) {
  return (
    <span className={`${styles.pill} ${styles[severity]}`}>
      <span aria-hidden="true" className={styles.icon}>
        {SEVERITY_ICON[severity]}
      </span>
      <span>{children ?? SEVERITY_LABEL[severity]}</span>
    </span>
  );
}
