import type { Metadata } from "next";
import Nav from "@/components/nav";
import "./globals.scss";
import styles from "./layout.module.scss";

export const metadata: Metadata = {
  title: "Clusterflick — manage",
  description:
    "Review the Clusterflick data pipeline: catalogue quality, LLM spend, workflow stability and venue health.",
  // An internal review tool. Nothing here should turn up in search results,
  // and the underlying telemetry is explicitly not published for reuse.
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className={styles.shell}>
          <Nav />
          <main className={styles.main}>{children}</main>
        </div>
      </body>
    </html>
  );
}
