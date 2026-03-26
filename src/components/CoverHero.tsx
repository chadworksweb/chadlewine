import Link from "next/link";
import { formatDate } from "@/lib/utils";

interface CoverHeroProps {
  title: string;
  slug: string;
  dateCaptured: string;
  hookLine: string;
  artImageUrl?: string;
  artAlt?: string;
}

export function CoverHero({
  title,
  slug,
  dateCaptured,
  hookLine,
  artImageUrl,
  artAlt,
}: CoverHeroProps) {
  return (
    <section id="cover-hero" className="cover-hero">
      {artImageUrl && (
        <Link href={`/observations/${slug}`} className="cover-hero__art-link">
          <div className="cover-hero__art-wrap">
            <img
              src={artImageUrl}
              alt={artAlt || title}
              className="cover-hero__art"
            />
          </div>
        </Link>
      )}

      <div className="cover-hero__content">
        <div className="cover-hero__title-col">
          <Link href={`/observations/${slug}`} className="cover-hero__title-link">
            <h1 className="cover-hero__title">
              {title}
            </h1>
          </Link>

          {hookLine && (
            <p className="cover-hero__hook">
              {hookLine}
            </p>
          )}
        </div>

        <div className="cover-hero__bar">
          <time className="cover-hero__date">
            {formatDate(dateCaptured)}
          </time>
          <Link href={`/observations/${slug}`} className="cover-hero__cta">
            Read the Observation →
          </Link>
        </div>
      </div>
    </section>
  );
}
