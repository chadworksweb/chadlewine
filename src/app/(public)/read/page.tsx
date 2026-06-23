import type { Metadata } from "next";
import Link from "next/link";
import { mergeMetadata } from "@/lib/page-meta";

const DEFAULT_METADATA: Metadata = {
  title: "Read",
  description:
    "Writing from Chad Lewine -- Observations and the Journal.",
  alternates: { canonical: "https://chadlewine.com/read" },
  openGraph: {
    title: "Read -- Chad Lewine",
    description:
      "Writing from Chad Lewine -- Observations and the Journal.",
    url: "https://chadlewine.com/read",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  return mergeMetadata("/read", DEFAULT_METADATA);
}

const SECTIONS = [
  {
    href: "/observations",
    title: "Observations",
    desc: "Short essays on what I observe and think about things not directly related to my personal endeavors",
  },
  {
    href: "/journal",
    title: "Journal",
    desc: "News, updates, and thoughts on my own life or work.",
  },
];

export default function ReadHubPage() {
  return (
    <div className="irl-page">
      <section className="irl-page__header">
        <div className="glyph-title-bar glyph-title-bar--top">
          <span className="glyph-title-bar__label" aria-hidden="true">░▒▓█</span>
          <h1 className="glyph-title-bar__heading">Read</h1>
          <span className="glyph-title-bar__label" aria-hidden="true">█▓▒░</span>
        </div>
        <p className="irl-page__intro">
          Writing from Chad Lewine -- Observations on the world, and a Journal of life and work.
        </p>
      </section>

      <section className="irl-events read-hub__grid">
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href} className="irl-event-card" aria-label={`${s.title} -- read more`}>
            <h2 className="irl-event-card__title">{s.title}</h2>
            <p className="irl-event-card__desc">{s.desc}</p>
            <span className="irl-event-card__cta">Read {s.title} &rarr;</span>
          </Link>
        ))}
      </section>
    </div>
  );
}
