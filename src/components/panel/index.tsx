import type { ReactNode } from "react";
import styles from "./index.module.scss";

type Props = {
  title?: ReactNode;
  // The one-line "what does this number actually mean" that stops a reader
  // drawing the wrong conclusion. Most panels here need one.
  note?: ReactNode;
  actions?: ReactNode;
  id?: string;
  children: ReactNode;
  // Tables and charts set their own padding, so they opt out of the panel's.
  flush?: boolean;
};

export default function Panel({ title, note, actions, id, children, flush }: Props) {
  return (
    <section className={styles.panel} id={id}>
      {(title || actions) && (
        <header className={styles.header}>
          <div>
            {title && <h2 className={styles.title}>{title}</h2>}
            {note && <p className={styles.note}>{note}</p>}
          </div>
          {actions && <div className={styles.actions}>{actions}</div>}
        </header>
      )}
      <div className={flush ? styles.bodyFlush : styles.body}>{children}</div>
    </section>
  );
}
