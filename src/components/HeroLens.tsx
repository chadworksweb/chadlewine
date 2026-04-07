"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { CoverArtPlayground } from "@/components/CoverArtPlayground";
import { TitleReveal } from "@/components/TitleReveal";

interface Observation {
  slug: string;
  title: string;
  date_captured: string;
  hook_line: string;
  art_image_path: string;
  art_alt: string;
  categories: { title: string; slug: string }[];
  tags: { label: string; slug: string }[];
}

interface HeroLensProps {
  observations: Observation[];
}

const SCROLL_THRESHOLD = 120;
const TRANSITION_MS = 600;
const EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

export function HeroLens({ observations }: HeroLensProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const [slideDirection, setSlideDirection] = useState<"up" | "down" | null>(null);
  const accumulatedDelta = useRef(0);
  const railRef = useRef<HTMLDivElement>(null);
  const lockoutRef = useRef(false);

  const total = observations.length;
  const current = observations[currentIndex];

  const advance = useCallback(
    (direction: "up" | "down") => {
      if (lockoutRef.current) return;
      const nextIndex =
        direction === "up"
          ? Math.min(currentIndex + 1, total - 1)
          : Math.max(currentIndex - 1, 0);
      if (nextIndex === currentIndex) {
        accumulatedDelta.current = 0;
        return;
      }

      lockoutRef.current = true;
      setSlideDirection(direction);
      setTransitioning(true);

      setTimeout(() => {
        setCurrentIndex(nextIndex);
        setSlideDirection(null);
        setTransitioning(false);
        lockoutRef.current = false;
        accumulatedDelta.current = 0;
      }, TRANSITION_MS);
    },
    [currentIndex, total]
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      accumulatedDelta.current += e.deltaY;

      if (accumulatedDelta.current > SCROLL_THRESHOLD) {
        advance("up");
        accumulatedDelta.current = 0;
      } else if (accumulatedDelta.current < -SCROLL_THRESHOLD) {
        advance("down");
        accumulatedDelta.current = 0;
      }
    },
    [advance]
  );

  // Touch on rail
  const touchStartY = useRef(0);
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const delta = touchStartY.current - e.changedTouches[0].clientY;
      if (Math.abs(delta) > 40) {
        advance(delta > 0 ? "up" : "down");
      }
    },
    [advance]
  );

  // Prevent default wheel on rail to stop page scroll
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const prevent = (e: WheelEvent) => e.preventDefault();
    rail.addEventListener("wheel", prevent, { passive: false });
    return () => rail.removeEventListener("wheel", prevent);
  }, []);

  if (!current) return null;

  let artTransform = "translateY(0)";
  let artOpacity = 1;
  if (transitioning && slideDirection) {
    artTransform = slideDirection === "up" ? "translateY(-6%)" : "translateY(6%)";
    artOpacity = 0;
  }

  return (
    <section className="hero-lens">
      {/* Two-column: content left, rail right */}
      <div className="hero-lens__columns">
        <div className="hero-lens__main">
          {/* Art */}
          <div
            className="hero-lens__art"
            style={{
              transform: artTransform,
              opacity: artOpacity,
              transition: transitioning
                ? `transform ${TRANSITION_MS}ms ${EASING}, opacity ${TRANSITION_MS * 0.5}ms ease`
                : "none",
            }}
          >
            {current.art_image_path && (
              <CoverArtPlayground
                src={current.art_image_path}
                alt={current.art_alt || current.title}
                className="cover-hero__art-wrap"
              />
            )}
          </div>

          {/* Content below art */}
          <div className="cover-hero__content">
            <div className="cover-hero__title-col">
              <TitleReveal artImageUrl={current.art_image_path || ""}>
                <Link href={`/observations/${current.slug}`} className="cover-hero__title-link">
                  <h1 className="cover-hero__title">{current.title}</h1>
                </Link>
              </TitleReveal>

              {current.hook_line && (
                <p className="cover-hero__hook">{current.hook_line}</p>
              )}
            </div>

            <div className="cover-hero__bar">
              <time className="cover-hero__date">{formatDate(current.date_captured)}</time>

              {current.categories?.length > 0 && (
                <div className="cover-hero__cats">
                  {current.categories.map((c) => (
                    <span key={c.slug} className="cover-hero__tag cover-hero__tag--cat">{c.title}</span>
                  ))}
                </div>
              )}

              {current.tags?.length > 0 && (
                <div className="cover-hero__tags">
                  {current.tags.map((t) => (
                    <span key={t.slug} className="cover-hero__tag">#{t.label}</span>
                  ))}
                </div>
              )}

              <Link href={`/observations/${current.slug}`} className="cover-hero__cta cover-hero__cta--inverted">
                Read the Observation →
              </Link>
            </div>
          </div>
        </div>

        {/* Scroll rail — full height of hero, own column */}
        <div
          ref={railRef}
          className="hero-lens__rail"
          onWheel={handleWheel}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div className="hero-lens__rail-label">SCROLL</div>
          <div className="hero-lens__pips">
            {observations.map((_, i) => (
              <span
                key={i}
                className={`hero-lens__pip${i === currentIndex ? " hero-lens__pip--active" : ""}${i < currentIndex ? " hero-lens__pip--past" : ""}`}
              />
            ))}
          </div>
          <div className="hero-lens__rail-counter">
            {currentIndex + 1} / {total}
          </div>
        </div>
      </div>
    </section>
  );
}
