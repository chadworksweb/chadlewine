import type { Metadata } from "next";
import Link from "next/link";
import { mergeMetadata } from "@/lib/page-meta";

export const revalidate = 60;

const DEFAULT_METADATA: Metadata = {
  title: "Who Is Chad Lewine",
  description:
    "The canonical biographical page for Chad Lewine — songwriter, recording artist, and architect of the Rising Compass.",
  alternates: {
    canonical: "https://chadlewine.com/chad-lewine",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  return mergeMetadata("/chad-lewine", DEFAULT_METADATA);
}

export default function AboutPage() {
  return (
    <article id="page-about" className="page-about">
      <div className="page-about__grid">
        <div className="page-about__bio">
          <header className="page-about__header">
            <h1 className="page-about__title">About Chad Lewine</h1>
          </header>
          <p>
            For nearly two decades, Chad Lewine has been writing songs to validate and empower anyone who has been called crazy for suggesting that our world is not as it may seem. His songs examine life as a human being growing up and living by the programmatic constraints of the institutionalized rules of modernity, realizing the programming, and attempting to escape and survive while doing so. His lyrics identify and indict extractive institutions while simultaneously offering camaraderie and alternative ways of living, thinking and being for the listener to consider.
          </p>
          <p>
            Chad recently built <Link href="https://risingcompass.net">The Rising Compass</Link>, the first and only tool that analyzes and visualizes the positive or negative charge of the messages behind the lyrics of the world&rsquo;s most popular songs, starting in 1960: the first year of the Billboard Hot 100.
          </p>
          <p>
            Chad operates as a <Link href="/super-individual">Super Individual</Link>: a sovereign human being who has fully reclaimed their power from and operates outside of the extractive institutions of modernity. He executive produces everything he puts his name on, supports himself and funds his work with freelance web design, and has done all of it without real familial or institutional support; emotional, financial or otherwise.
          </p>
          <p>
            Every day, Chad continues to produce work with a relentless, fire-breathing passion. Not to amass personal fortune or attain fame, but to live as a beacon for all who are exploring and embodying new ways of living, thinking and being that empower everyone, not a select few.
          </p>
          <p>
            Chad has nothing to lose, and Chad never gives up.
          </p>

          <div className="page-about__cta-row">
            <Link href="/radiant-arc" className="page-about__cta">
              See the Radiant Arc &rarr;
            </Link>
            <Link href="/super-individual" className="page-about__cta page-about__cta--ghost">
              The Super Individual &rarr;
            </Link>
          </div>
        </div>

        <aside className="page-about__image">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/chad-lewine-about-page.webp"
            alt="Chad Lewine — portrait"
            width={696}
            height={1399}
          />
        </aside>
      </div>
    </article>
  );
}
