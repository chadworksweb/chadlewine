"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { CoverArtPlayground } from "@/components/CoverArtPlayground";
import { TitleReveal } from "@/components/TitleReveal";

export interface HeroLensItem {
  slug: string;
  title: string;
  date: string | null;
  hook: string;
  artImagePath: string;
  artAlt: string;
  href: string;
  ctaLabel: string;
  focalX?: number; // 0-1
  focalY?: number; // 0-1
  categories?: { title: string; slug: string }[];
  tags?: { label: string; slug: string }[];
}

interface HeroLensProps {
  items: HeroLensItem[];
  onIndexChange?: (index: number) => void;
}

const SCROLL_THRESHOLD = 120;
const TRANSITION_MS = 1500;

function HeroLensSlide({ item }: { item: HeroLensItem }) {
  return (
    <>
      <div className="hero-lens__slide-art">
        {item.artImagePath && (
          <CoverArtPlayground
            src={item.artImagePath}
            alt={item.artAlt || item.title}
            className="cover-hero__art-wrap"
            focalX={item.focalX}
            focalY={item.focalY}
          />
        )}
      </div>

      <div className="hero-lens__slide-content">
        <div className="cover-hero__title-col">
          <TitleReveal artImageUrl={item.artImagePath || ""}>
            <Link href={item.href} className="cover-hero__title-link">
              <h1 className="cover-hero__title">{item.title}</h1>
            </Link>
          </TitleReveal>

          {item.hook && (
            <p className="cover-hero__hook">{item.hook}</p>
          )}
        </div>

        <div className="cover-hero__bar">
          <Link href={item.href} className="hero-lens__cta">
            {item.ctaLabel}
          </Link>

          {item.date && (
            <time className="cover-hero__date">{formatDate(item.date)}</time>
          )}

          {item.categories && item.categories.length > 0 && (
            <div className="cover-hero__cats">
              {item.categories.map((c, i) => (
                <span key={c.slug}>
                  <span className="cover-hero__tag cover-hero__tag--cat">{c.title}</span>
                  {i < item.categories!.length - 1 && ", "}
                </span>
              ))}
            </div>
          )}

          {item.tags && item.tags.length > 0 && (
            <div className="cover-hero__tags">
              {item.tags.map((t, i) => (
                <span key={t.slug}>
                  <span className="cover-hero__tag">#{t.label}</span>
                  {i < item.tags!.length - 1 && ", "}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export function HeroLens({ items, onIndexChange }: HeroLensProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const accumulatedDelta = useRef(0);
  const railRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const lockoutRef = useRef(false);
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);

  const total = items.length;

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp || viewportHeight !== null) return;
    const h = vp.getBoundingClientRect().height;
    if (h > 0) setViewportHeight(h);
  }, [viewportHeight]);

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
          {items.map((item, i) => {
            const offset = i - currentIndex;
            if (Math.abs(offset) > 1) return null;
            const translateY = offset === 0 ? "0%" : offset < 0 ? "-100%" : "100%";
            return (
              <div
                key={item.slug}
                className={`hero-lens__slide${i === currentIndex ? " hero-lens__slide--current" : ""}`}
                style={{
                  transform: `translateY(${translateY})`,
                  zIndex: i === currentIndex ? 2 : 1,
                }}
                aria-hidden={i !== currentIndex}
              >
                <HeroLensSlide item={item} />
              </div>
            );
          })}
        </div>

        <div
          ref={railRef}
          className="hero-lens__rail"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div className="hero-lens__rail-label">SCROLL</div>
          <div className="hero-lens__pips">
            {items.map((_, i) => (
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
