import type { ReactNode } from "react";
import styles from "./index.module.scss";

type Props = {
  title: string;
  // The window and source the page's figures are measured over.
  meta?: ReactNode;
};

export default function PageHeader({ title, meta }: Props) {
  return (
    <header className={styles.header}>
      <h1>{title}</h1>
      {meta && <p className={styles.meta}>{meta}</p>}
    </header>
  );
}
