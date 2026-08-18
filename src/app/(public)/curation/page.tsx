import type { Metadata } from "next";
import Link from "next/link";
import { mergeMetadata } from "@/lib/page-meta";

const HIGH_VIBE_DB_URL = "https://leam.libraengine.com/music/database";

const DEFAULT_METADATA: Metadata = {
  title: "Curation",
  description:
    "Music Chad Lewine points at: the CL Stream, and the High Vibe Song Database at LEAM.",
  alternates: { canonical: "https://chadlewine.com/curation" },
  openGraph: {
    title: "Curation - Chad Lewine",
    description:
      "Music Chad Lewine points at: the CL Stream, and the High Vibe Song Database at LEAM.",
    url: "https://chadlewine.com/curation",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  return mergeMetadata("/curation", DEFAULT_METADATA);
}

export default function CurationHubPage() {
  return (
    <div className="irl-page">
      <section className="irl-page__header curation-hub__header">
        <h1 className="page-static__title">Curation</h1>
        <p className="irl-page__intro">
          What I listen to, and the larger collection it belongs to.
        </p>
      </section>

      <section className="curation-doors">
        <article className="curation-door">
          <span className="curation-door__bar" aria-hidden="true">
            <span className="curation-door__glyph">
              <span className="curation-door__glyph-frame">░▒▓█▓▒░</span>
            </span>
          </span>
          <h2 className="curation-door__title">CL Stream</h2>
          <p className="curation-door__desc">
            Songs that are or at one time were on personal heavy rotation.
          </p>
          <Link href="/curation/cl-stream" className="curation-door__cta">
            <span>Enter the CL Stream</span>
          </Link>
        </article>

        <article className="curation-door">
          <span className="curation-door__bar" aria-hidden="true">
            <span className="curation-door__glyph">
              <span className="curation-door__glyph-frame">░▒▓█▓▒░</span>
            </span>
          </span>
          <h2 className="curation-door__title">High Vibe Song Database</h2>
          <p className="curation-door__desc">
            Database exclusively aggregating songs with intentionally positive
            lyrics.
          </p>
          <a
            href={HIGH_VIBE_DB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="curation-door__cta"
          >
            <span>Enter the Database</span>
            <svg
              className="curation-door__ext"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            <span className="visually-hidden">opens in a new tab</span>
          </a>
        </article>
      </section>
    </div>
  );
}
