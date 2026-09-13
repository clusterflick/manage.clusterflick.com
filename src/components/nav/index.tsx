"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./index.module.scss";

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/catalogue", label: "Catalogue" },
  { href: "/llm-usage", label: "LLM usage" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/venues", label: "Venues" },
];

export default function Nav() {
  const pathname = usePathname();
  // Paths are exported with a trailing slash, so compare on the trimmed form
  // rather than letting "/catalogue/" miss "/catalogue".
  const current = pathname.replace(/\/+$/, "") || "/";

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/" className={styles.brand}>
          <span className={styles.mark} aria-hidden="true" />
          <span>
            clusterflick<span className={styles.brandDim}> / manage</span>
          </span>
        </Link>
        <nav className={styles.nav} aria-label="Sections">
          {LINKS.map(({ href, label }) => {
            const isCurrent =
              href === "/" ? current === "/" : current.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={isCurrent ? styles.current : styles.link}
                aria-current={isCurrent ? "page" : undefined}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
