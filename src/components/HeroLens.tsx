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
  onIndexChange?: (index: number) => void;
}

const SCROLL_THRESHOLD = 120;
const TRANSITION_MS = 1500;

function ObservationSlide({ obs }: { obs: Observation }) {
  return (
    <>
      <div className="hero-lens__slide-art">
        {obs.art_image_path && (
          <CoverArtPlayground
            src={obs.art_image_path}
            alt={obs.art_alt || obs.title}
            className="cover-hero__art-wrap"
          />
        )}
      </div>

      <div className="hero-lens__slide-content">
        <div className="cover-hero__title-col">
          <TitleReveal artImageUrl={obs.art_image_path || ""}>
            <Link href={`/observations/${obs.slug}`} className="cover-hero__title-link">
              <h1 className="cover-hero__title">{obs.title}</h1>
            </Link>
          </TitleReveal>

          {obs.hook_line && (
            <p className="cover-hero__hook">{obs.hook_line}</p>
          )}
        </div>

        <div className="cover-hero__bar">
          <Link href={`/observations/${obs.slug}`} className="hero-lens__cta">
            Read Observation →
          </Link>

          <time className="cover-hero__date">{formatDate(obs.date_captured)}</time>

          {obs.categories?.length > 0 && (
            <div className="cover-hero__cats">
              {obs.categories.map((c, i) => (
                <span key={c.slug}>
                  <span className="cover-hero__tag cover-hero__tag--cat">{c.title}</span>
                  {i < obs.categories.length - 1 && ", "}
                </span>
              ))}
            </div>
          )}

          {obs.tags?.length > 0 && (
            <div className="cover-hero__tags">
              {obs.tags.map((t, i) => (
                <span key={t.slug}>
                  <span className="cover-hero__tag">#{t.label}</span>
                  {i < obs.tags.length - 1 && ", "}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export function HeroLens({ observations, onIndexChange }: HeroLensProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const accumulatedDelta = useRef(0);
  const railRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const lockoutRef = useRef(false);
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);

  const total = observations.length;

  // Measure viewport height from the active slide's natural size once
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp || viewportHeight !== null) return;
    const h = vp.getBoundingClientRect().height;
    if (h > 0) setViewportHeight(h);
  }, [viewportHeight]);

  // Re-measure on resize
  useEffect(() => {
    const measure = () => {
      const vp = viewportRef.current;
      if (!vp) return;
      vp.style.height = "auto";
      const h = vp.getBoundingClientRect().height;
      vp.style.height = "";
      if (h > 0) setViewportHeight(h);
    };
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const onIndexChangeRef = useRef(onIndexChange);
  onIndexChangeRef.current = onIndexChange;

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
      setCurrentIndex(nextIndex);
      onIndexChangeRef.current?.(nextIndex);
      setTimeout(() => {
        lockoutRef.current = false;
        accumulatedDelta.current = 0;
      }, TRANSITION_MS);
    },
    [currentIndex, total]
  );

  const advanceRef = useRef(advance);
  advanceRef.current = advance;

  const touchStartY = useRef(0);
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const delta = touchStartY.current - e.changedTouches[0].clientY;
      if (Math.abs(delta) > 40) {
        advanceRef.current(delta > 0 ? "up" : "down");
      }
    },
    []
  );

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      accumulatedDelta.current += e.deltaY;
      if (accumulatedDelta.current > SCROLL_THRESHOLD) {
        advanceRef.current("up");
        accumulatedDelta.current = 0;
      } else if (accumulatedDelta.current < -SCROLL_THRESHOLD) {
        advanceRef.current("down");
        accumulatedDelta.current = 0;
      }
    };
    rail.addEventListener("wheel", handleWheel, { passive: false });
    return () => rail.removeEventListener("wheel", handleWheel);
  }, []);

  if (total === 0) return null;

  return (
    <section className="hero-lens">
      <div className="hero-lens__columns">
        <div
          ref={viewportRef}
          className="hero-lens__viewport"
          style={viewportHeight ? { height: viewportHeight } : undefined}
        >
          {observations.map((obs, i) => {
            const offset = i - currentIndex;
            if (Math.abs(offset) > 1) return null;
            const translateY = offset === 0 ? "0%" : offset < 0 ? "-100%" : "100%";
            return (
              <div
                key={obs.slug}
                className={`hero-lens__slide${i === currentIndex ? " hero-lens__slide--current" : ""}`}
                style={{
                  transform: `translateY(${translateY})`,
                  zIndex: i === currentIndex ? 2 : 1,
                }}
                aria-hidden={i !== currentIndex}
              >
                <ObservationSlide obs={obs} />
              </div>
            );
          })}
        </div>

        {/* Scroll rail — static, never slides */}
        <div
          ref={railRef}
          className="hero-lens__rail"
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
