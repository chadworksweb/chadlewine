"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef } from "react";
import { CompassIcon } from "@/components/RisingCompassMark";

// One track, presented as a "model bay" in the collection: a cinematic art
// stage on one side, a spec sheet (name / description / Rising Compass read /
// the real compass gauge + stats / CTA) on the other. Sides alternate.
export interface ReleaseTrackGridTrack {
  id: string;
  slug: string;
  title: string;
  trackNumber: number;
  collection: string;
  summary: string | null;
  durationSeconds: number | null;
  art: string | null;
  artAlt: string | null;
  focalX: number | null; // 0-100 (percent); null = center
  focalY: number | null;
  deadpan: string | null;
  chargeSummary: string | null;
  pending: boolean;
  badge: { tierLabel: string; tierHex: string; charge: number } | null;
  badgeHref: string;
}

function fmtRuntime(seconds: number | null): string | null {
  if (seconds == null || seconds <= 0) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export function ReleaseTrackGrid({ tracks }: { tracks: ReleaseTrackGridTrack[] }) {
  const listRef = useRef<HTMLOListElement | null>(null);
  const bayRefs = useRef<(HTMLElement | null)[]>([]);

  // Choreographed reveal. The hidden state is "armed" only here in JS, so
  // without JS the bays render fully visible (crawlers / no-script see content).
  // Each bay's two columns animate independently (art stage vs. cascading spec
  // lines) -- the row never moves as one block. Reduced-motion shows all at once.
  useEffect(() => {
    const list = listRef.current;
    const bays = bayRefs.current.filter(Boolean) as HTMLElement[];
    if (!list || bays.length === 0) return;

    const reduce =
      typeof matchMedia !== "undefined" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduce || typeof IntersectionObserver === "undefined") {
      bays.forEach((b) => b.classList.add("is-in"));
      return;
    }

    list.classList.add("rtg--armed");
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            obs.unobserve(e.target);
          }
        }
      },
      { threshold: 0.2, rootMargin: "0px 0px -12% 0px" },
    );
    bays.forEach((b) => obs.observe(b));
    return () => obs.disconnect();
  }, [tracks]);

  if (tracks.length === 0) return null;

  return (
    <section className="album-section album-section--track-grid" aria-labelledby="rtg-heading">
      <div className="album-section__inner">
        <header className="rtg__intro">
          <h2 className="album-section__heading rtg__intro-title" id="rtg-heading">
            Tracks
          </h2>
        </header>

        <ol className="rtg" ref={listRef}>
          {tracks.map((t, i) => {
            const nn = String(t.trackNumber).padStart(2, "0");
            const href = `/music/songs/${t.slug}`;
            const objectPosition = `${t.focalX ?? 50}% ${t.focalY ?? 50}%`;
            const runtime = fmtRuntime(t.durationSeconds);

            return (
              <li
                key={t.id}
                ref={(el) => { bayRefs.current[i] = el; }}
                className={`rtg__bay${i % 2 === 0 ? " rtg__bay--rev" : ""}`}
              >
                {/* Art stage (one column) */}
                <Link href={href} className="rtg__stage" aria-label={`Explore ${t.title}`}>
                  <span className="rtg__frame">
                    {t.art ? (
                      <Image
                        src={t.art}
                        alt={t.artAlt || t.title}
                        fill
                        sizes="(max-width: 860px) 100vw, 48vw"
                        className="rtg__shot"
                        style={{ objectPosition }}
                      />
                    ) : (
                      <span className="rtg__shot-fallback" aria-hidden="true" />
                    )}
                    <span className="rtg__veil" aria-hidden="true" />
                    <span className="rtg__scan" aria-hidden="true" />
                  </span>
                </Link>

                {/* Spec sheet (other column) -- children cascade independently */}
                <div className="rtg__spec">
                  <span className="rtg__index" aria-hidden="true">{nn}</span>

                  <h3 className="rtg__name">
                    <Link href={href} className="rtg__name-link">{t.title}</Link>
                  </h3>

                  {t.summary && <p className="rtg__desc">{t.summary}</p>}

                  <div className="rtg__sheet">
                    {t.badge && (
                      <a
                        href={t.badgeHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rtg__gauge"
                        aria-label={`Rising Compass: ${t.badge.tierLabel}, charge ${t.badge.charge > 0 ? "+" : ""}${t.badge.charge}`}
                      >
                        <CompassIcon charge={t.badge.charge} tierHex={t.badge.tierHex} />
                        {t.pending && <span className="rtg__pending" aria-hidden="true">PENDING</span>}
                      </a>
                    )}

                    <dl className="rtg__stats">
                      {t.badge && (
                        <div className="rtg__stat">
                          <dt>Classification</dt>
                          <dd style={{ color: t.badge.tierHex }}>{t.badge.tierLabel}</dd>
                        </div>
                      )}
                      {t.badge && (
                        <div className="rtg__stat">
                          <dt>Charge</dt>
                          <dd>{t.badge.charge > 0 ? "+" : ""}{t.badge.charge}</dd>
                        </div>
                      )}
                      {runtime && (
                        <div className="rtg__stat">
                          <dt>Runtime</dt>
                          <dd>{runtime}</dd>
                        </div>
                      )}
                    </dl>
                  </div>

                  <Link href={href} className="rtg__cta">
                    <span className="rtg__cta-text" data-text="Explore song">Explore song</span>
                    <span className="rtg__cta-arrow" aria-hidden="true">&rarr;</span>
                  </Link>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
