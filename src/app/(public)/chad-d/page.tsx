import type { Metadata } from "next";
import { mergeMetadata } from "@/lib/page-meta";

const DEFAULT_METADATA: Metadata = {
  title: "Chad D — The Early Identity",
  description:
    "The Chad D era — where it started. How the earliest version of Chad Lewine's creative identity laid the groundwork for everything that followed.",
  alternates: {
    canonical: "https://chadlewine.com/chad-d",
  },
  openGraph: {
    title: "Chad D — The Early Identity | Chad Lewine",
    description:
      "The Chad D era — where it started. How the earliest version of Chad Lewine's creative identity laid the groundwork for everything that followed.",
    url: "https://chadlewine.com/chad-d",
    type: "article",
  },
  robots: {
    index: true,
    follow: true,
    "max-image-preview": "large" as const,
    "max-snippet": -1,
  },
};

export async function generateMetadata(): Promise<Metadata> {
  return mergeMetadata("/chad-d", DEFAULT_METADATA);
}

export default function ChadDPage() {
  return (
    <article id="page-chad-d" className="page-static">
      <h1 className="page-static__title">Chad D</h1>

      <div className="reading-column" style={{ maxWidth: "100%", padding: 0 }}>
        <p className="page-who__placeholder">
          Content in progress.
        </p>
      </div>
    </article>
  );
}
