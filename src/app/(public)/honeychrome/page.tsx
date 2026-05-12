import type { Metadata } from "next";
import { mergeMetadata } from "@/lib/page-meta";

const DEFAULT_METADATA: Metadata = {
  title: "HoneyChrome — The Design Era",
  description:
    "The HoneyChrome era — when Chad Lewine operated under a design-forward identity. What was built, what it meant, and how it evolved into what came next.",
  alternates: {
    canonical: "https://chadlewine.com/honeychrome",
  },
  openGraph: {
    title: "HoneyChrome — The Design Era | Chad Lewine",
    description:
      "The HoneyChrome era — when Chad Lewine operated under a design-forward identity. What was built, what it meant, and how it evolved into what came next.",
    url: "https://chadlewine.com/honeychrome",
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
  return mergeMetadata("/honeychrome", DEFAULT_METADATA);
}

export default function HoneyChromePage() {
  return (
    <article id="page-honeychrome" className="page-static">
      <h1 className="page-static__title">HoneyChrome</h1>

      <div className="prose">
        <p className="page-who__placeholder">
          Content in progress.
        </p>
      </div>
    </article>
  );
}
