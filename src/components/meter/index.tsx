import styles from "./index.module.scss";

type Props = {
  value: number;
  label: string;
  slot?: number;
};

// A coverage bar. The number beside it is the real reading - the bar is there
// to make a column of them scannable, so it is deliberately thin and unlabelled.
export default function Meter({ value, label, slot = 1 }: Props) {
  const percent = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className={styles.track} role="img" aria-label={label} title={label}>
      <div
        className={styles.fill}
        style={{ width: `${percent}%`, background: `var(--series-${slot})` }}
      />
    </div>
  );
}
