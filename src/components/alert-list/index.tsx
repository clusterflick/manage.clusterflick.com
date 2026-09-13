import type { Alert } from "@/lib/reports";
import { SEVERITY_ICON, SEVERITY_LABEL } from "@/lib/status";
import styles from "./index.module.scss";

// The alerts carry an icon and the severity word alongside the colour, so the
// state survives greyscale, colour-blindness and forced-colours mode.
export default function AlertList({ alerts }: { alerts: Alert[] }) {
  if (!alerts.length) {
    return (
      <p className={styles.clear}>
        <span aria-hidden="true">{SEVERITY_ICON.good}</span> Nothing needs
        attention — every check the overview runs came back clean.
      </p>
    );
  }

  return (
    <ul className={styles.list}>
      {alerts.map((alert) => (
        <li key={alert.title} className={`${styles.item} ${styles[alert.severity]}`}>
          <span className={styles.icon} aria-hidden="true">
            {SEVERITY_ICON[alert.severity]}
          </span>
          <div className={styles.body}>
            <a href={alert.href} className={styles.title}>
              {alert.title}
            </a>
            <p className={styles.detail}>{alert.detail}</p>
          </div>
          <span className={styles.severity}>{SEVERITY_LABEL[alert.severity]}</span>
        </li>
      ))}
    </ul>
  );
}
