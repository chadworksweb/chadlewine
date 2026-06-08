import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { TitleReveal } from "@/components/TitleReveal";
import { CoverArtPlayground } from "@/components/CoverArtPlayground";

interface CoverHeroProps {
  title: string;
  slug: string;
  dateCaptured: string;
  hookLine: string;
  artImageUrl?: string;
  artAlt?: string;
  href?: string;
  ctaLabel?: string;
}

export function CoverHero({
  title,
  slug,
  dateCaptured,
  hookLine,
  artImageUrl,
  artAlt,
  href,
  ctaLabel,
}: CoverHeroProps) {
  const target = href ?? `/writings/observations/${slug}`;
  return (
    <section id="cover-hero" className="cover-hero">
      {artImageUrl && (
        <CoverArtPlayground
          src={artImageUrl}
          alt={artAlt || title}
          className="cover-hero__art-wrap"
        />
      )}

      <div className="cover-hero__content">
        <div className="cover-hero__title-col">
          <TitleReveal artImageUrl={artImageUrl || ""}>
            <Link href={target} className="cover-hero__title-link">
              <h1 className="cover-hero__title">
                {title}
              </h1>
            </Link>
          </TitleReveal>

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
          <Link href={target} className="cover-hero__cta">
            {ctaLabel ?? "Read the Observation →"}
          </Link>
        </div>
      </div>
    </section>
  );
}
