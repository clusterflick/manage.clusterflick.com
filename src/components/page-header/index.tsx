import type { ReactNode } from "react";
import styles from "./index.module.scss";

type Props = {
  title: string;
  // One sentence saying what this page is measuring and over what window. Every
  // page has one, because every figure on it is relative to something.
  lede: ReactNode;
  meta?: ReactNode;
};

export default function PageHeader({ title, lede, meta }: Props) {
  return (
    <header className={styles.header}>
      <h1>{title}</h1>
      <p className={styles.lede}>{lede}</p>
      {meta && <p className={styles.meta}>{meta}</p>}
    </header>
  );
}
