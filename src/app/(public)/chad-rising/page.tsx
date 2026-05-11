import type { Metadata } from "next";
import { mergeMetadata } from "@/lib/page-meta";

const DEFAULT_METADATA: Metadata = {
  title: "Chad Rising — The Music Identity",
  description:
    "The Chad Rising era — the artist name behind 13 albums and 151 songs. How this music identity became the bridge to Chad Lewine.",
  alternates: {
    canonical: "https://chadlewine.com/chad-rising",
  },
  openGraph: {
    title: "Chad Rising — The Music Identity | Chad Lewine",
    description:
      "The Chad Rising era — the artist name behind 13 albums and 151 songs. How this music identity became the bridge to Chad Lewine.",
    url: "https://chadlewine.com/chad-rising",
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
  return mergeMetadata("/chad-rising", DEFAULT_METADATA);
}

export default function ChadRisingPage() {
  return (
    <article id="page-chad-rising" className="page-static">
      <h1 className="page-static__title">Chad Rising</h1>

      <div className="reading-column" style={{ maxWidth: "100%", padding: 0 }}>
        <p className="page-who__placeholder">
          Content in progress.
        </p>
      </div>
    </article>
  );
}
