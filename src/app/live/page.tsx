import Link from "next/link";
import PageHeader from "@/components/page-header";
import PipelineLive from "@/components/pipeline-live";

export const metadata = { title: "Live pipeline — Clusterflick manage" };

// The one page read live rather than built: the pipeline as it runs, from the
// api-pipeline Worker. Its static HTML is just the header; the diagram arrives
// with the first answer from the Worker.
export default function LivePage() {
  return (
    <>
      <PageHeader
        title="Live pipeline"
        meta={
          <>
            Each stage&apos;s latest GitHub Actions run, read by the{" "}
            <a href="https://github.com/clusterflick/api-pipeline">
              api-pipeline
            </a>{" "}
            Worker every two minutes and refreshed here every 30 seconds. Pick a
            stage for its jobs. How reliably each stage runs over time is on{" "}
            <Link href="/pipeline">Pipeline</Link>.
          </>
        }
      />
      <PipelineLive />
    </>
  );
}
