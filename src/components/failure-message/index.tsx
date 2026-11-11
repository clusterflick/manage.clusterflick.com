import { shortenMessage } from "@/lib/format";
import styles from "./index.module.scss";

type Props = {
  message: string;
};

// A probe's failure message, short enough to scan in a table. A message that
// had to be cut can be opened for the whole of it. Native <details>, so it
// works in the server-rendered tables with no client code.
export default function FailureMessage({ message }: Props) {
  const short = shortenMessage(message);
  if (short === message) {
    return <span className={styles.message}>{message}</span>;
  }
  return (
    <details className={styles.details}>
      <summary className={styles.message}>{short}</summary>
      <div className={`${styles.message} ${styles.full}`}>{message}</div>
    </details>
  );
}
