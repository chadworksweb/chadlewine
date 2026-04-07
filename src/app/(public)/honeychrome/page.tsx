import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "HoneyChrome — The Design Era | Chad Lewine",
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

export default function HoneyChromePage() {
  return (
    <article id="page-honeychrome" className="page-static">
      <h1 className="page-static__title">HoneyChrome</h1>

      <div className="reading-column" style={{ maxWidth: "100%", padding: 0 }}>
        <p className="page-who__placeholder">
          Content in progress.
        </p>
      </div>
    </article>
  );
}
