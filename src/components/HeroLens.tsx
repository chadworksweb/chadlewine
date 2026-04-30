"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import { WaterRipple } from "@/components/WaterRipple";
import { TitleReveal } from "@/components/TitleReveal";

// HeroLens shows the album-cover slider for SONGS on the homepage. Songs
// have summaries (songs.song_summary), not hooks. Albums have concepts
// (albums.concept_statement), and observations have hooks (observations.hook_line).
// Don't reintroduce a generic "hook" field here — pick the entity-specific
// name when this slider is reused in a different context.
export type HeroKind = "song" | "album" | "merch" | "observation" | "art";

export interface HeroLensItem {
  slug: string;
  title: string;
  date: string | null;
  artImagePath: string;
  artAlt: string;
  href: string;
  ctaLabel: string;
  focalX?: number; // 0-1
  focalY?: number; // 0-1
  zoom?: number; // >= 1
  categories?: { title: string; slug: string }[];
  tags?: { label: string; slug: string }[];
  kind?: HeroKind;
}

interface HeroLensProps {
  items: HeroLensItem[];
  onIndexChange?: (index: number) => void;
}

const TRANSITION_MS = 1100;
const TRANSITION_MS_MOBILE = 500;

function HeroLensSlide({ item, isCurrent }: { item: HeroLensItem; isCurrent: boolean }) {
  const fx = item.focalX ?? 0.5;
  const fy = item.focalY ?? 0.5;
  const z = item.zoom && item.zoom >= 1 ? item.zoom : 1;
  const staticStyle: React.CSSProperties = { objectPosition: `${fx * 100}% ${fy * 100}%` };
  if (z !== 1) {
    staticStyle.transform = `scale(${z})`;
    staticStyle.transformOrigin = `${fx * 100}% ${fy * 100}%`;
  }
  return (
    <>
      <div className="hero-lens__slide-art">
        {item.artImagePath && (
          isCurrent ? (
            <WaterRipple
              src={item.artImagePath}
              alt={item.artAlt || item.title}
              className="cover-hero__art-wrap"
              focalX={item.focalX}
              focalY={item.focalY}
              zoom={item.zoom}
            />
          ) : (
            <div className="cover-hero__art-wrap">
              <img
                src={item.artImagePath}
                alt={item.artAlt || item.title}
                style={staticStyle}
              />
            </div>
          )
        )}
      </div>

      <div className="hero-lens__slide-content">
        <div className="cover-hero__title-col">
          <TitleReveal artImageUrl={item.artImagePath || ""}>
            <Link href={item.href} className="cover-hero__title-link">
              <h2 className="cover-hero__title">{item.title}</h2>
            </Link>
          </TitleReveal>
        </div>

        <div className="cover-hero__bar">
          <div className="hero-lens__cta-row">
            {item.kind && (
              <span className={`hero-lens__kind hero-lens__kind--${item.kind}`}>
                {item.kind}
              </span>
            )}

            <Link href={item.href} className="hero-lens__cta">
              {item.ctaLabel}
            </Link>
          </div>

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
  const viewportRef = useRef<HTMLDivElement>(null);
  const lockoutRef = useRef(false);
  // Viewport height tracks the CURRENT slide's intrinsic height so long
  // titles push the page down and short ones bring it back up. The CSS
  // height transition makes that motion smooth.
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  const [isMobile, setIsMobile] = useState(true);

  const total = items.length;

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Measure the current slide via a callback ref — runs the moment React
  // attaches/swaps the slide. We deliberately do NOT keep a ResizeObserver
  // around: it fires mid-animation as fonts/images settle and would restart
  // the viewport height transition each time, producing visible jitter.
  // Re-measure happens naturally when the slide-role changes, plus a
  // separate window-resize listener handles viewport-width reflows.
  const lastMeasuredRef = useRef<HTMLDivElement | null>(null);
  const setCurrentSlideRef = useCallback((el: HTMLDivElement | null) => {
    lastMeasuredRef.current = el;
    if (!el) return;
    // Use fractional bounding-rect height so the CSS transition has
    // smooth sub-pixel interpolation instead of integer-stepped jitter.
    const h = el.getBoundingClientRect().height;
    if (h > 0) setViewportHeight(h);
  }, []);

  useEffect(() => {
    const onResize = () => {
      const el = lastMeasuredRef.current;
      if (!el) return;
      const h = el.offsetHeight;
      if (h > 0) setViewportHeight(h);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const onIndexChangeRef = useRef(onIndexChange);
  onIndexChangeRef.current = onIndexChange;

  const advance = useCallback(
    (direction: "up" | "down") => {
      if (lockoutRef.current) return;
      if (total <= 1) return;
      // Carousel wraps: last → first, first → last. Keeps every slide
      // visually equal — both prev and next peeks are always populated.
      const nextIndex =
        direction === "up"
          ? (currentIndex + 1) % total
          : (currentIndex - 1 + total) % total;
      lockoutRef.current = true;
      setCurrentIndex(nextIndex);
      onIndexChangeRef.current?.(nextIndex);
      setTimeout(() => {
        lockoutRef.current = false;
      }, isMobile ? TRANSITION_MS_MOBILE : TRANSITION_MS);
    },
    [currentIndex, total, isMobile]
  );

  const advanceRef = useRef(advance);
  advanceRef.current = advance;

  const touchStart = useRef({ x: 0, y: 0 });
  const gestureAxis = useRef<null | "horizontal" | "vertical">(null);
  const [dragPx, setDragPx] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const viewportWidthRef = useRef(0);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (lockoutRef.current) return;
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    viewportWidthRef.current = viewportRef.current?.offsetWidth || window.innerWidth;
    gestureAxis.current = null;
    setDragPx(0);
    setIsDragging(false);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - touchStart.current.x;
    const dy = e.touches[0].clientY - touchStart.current.y;
    if (gestureAxis.current === null) {
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);
      if (ax < 12 && ay < 12) return;
      if (ax > ay * 1.5) {
        gestureAxis.current = "horizontal";
        setIsDragging(true);
      } else {
        gestureAxis.current = "vertical";
        return;
      }
    }
    if (gestureAxis.current !== "horizontal") return;
    setDragPx(dx);
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const wasHorizontal = gestureAxis.current === "horizontal";
      gestureAxis.current = null;
      if (!wasHorizontal) {
        setIsDragging(false);
        setDragPx(0);
        return;
      }
      const dx = e.changedTouches[0].clientX - touchStart.current.x;
      const threshold = Math.max(60, viewportWidthRef.current * 0.25);
      setIsDragging(false);
      setDragPx(0);
      if (Math.abs(dx) > threshold) {
        // Swipe-left (dx<0) → next (up); swipe-right (dx>0) → prev (down).
        advanceRef.current(dx < 0 ? "up" : "down");
      }
    },
    []
  );

  if (total === 0) return null;

  return (
    <section className="hero-lens">
      <div
        ref={viewportRef}
        className="hero-lens__viewport"
        style={viewportHeight ? { height: viewportHeight } : undefined}
        onTouchStart={isMobile ? handleTouchStart : undefined}
        onTouchMove={isMobile ? handleTouchMove : undefined}
        onTouchEnd={isMobile ? handleTouchEnd : undefined}
      >
        {items.map((item, i) => {
          // Shortest signed distance modulo total — so item N-1 reads as
          // offset -1 when current is 0, and item 0 reads as offset +1
          // when current is N-1. Carousel wraps both directions.
          let offset = i - currentIndex;
          if (offset > total / 2) offset -= total;
          else if (offset < -total / 2) offset += total;
          if (Math.abs(offset) > 1) return null;
          const role = offset === 0 ? "current" : offset < 0 ? "prev" : "next";

          const dragOffset = isMobile && isDragging ? ` + ${dragPx}px` : "";
          let baseTranslate;
          if (role === "current") baseTranslate = "0%";
          else if (role === "next") baseTranslate = "calc(100% - var(--hero-peek))";
          else baseTranslate = "calc(-100% + var(--hero-peek))";
          const transform = `translateX(calc(${baseTranslate}${dragOffset}))`;

          const onClickAdvance =
            role === "next"
              ? () => advanceRef.current("up")
              : role === "prev"
                ? () => advanceRef.current("down")
                : undefined;

          return (
            <div
              key={item.slug}
              ref={role === "current" ? setCurrentSlideRef : undefined}
              className={`hero-lens__slide hero-lens__slide--${role}`}
              style={{
                transform,
                transition: isMobile && isDragging ? "none" : undefined,
                // Peeks ride ABOVE the current slide so their visible 110px
                // strip overlays the current's edge. Otherwise current's
                // full-width image hides them.
                zIndex: role === "current" ? 1 : 2,
              }}
              aria-hidden={role !== "current"}
              role={role !== "current" ? "button" : undefined}
              aria-label={
                role === "next"
                  ? `Next: ${item.title}`
                  : role === "prev"
                    ? `Previous: ${item.title}`
                    : undefined
              }
              tabIndex={role !== "current" ? 0 : undefined}
              onClick={onClickAdvance}
              onKeyDown={
                role !== "current"
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onClickAdvance?.();
                      }
                    }
                  : undefined
              }
            >
              <HeroLensSlide item={item} isCurrent={role === "current"} />
            </div>
          );
        })}

        {total > 1 && (
          <>
            <button
              type="button"
              className="hero-lens__nav hero-lens__nav--prev"
              onClick={() => advanceRef.current("down")}
              aria-label="Previous slide"
            >
              <span className="hero-lens__nav-arrow" aria-hidden>‹</span>
            </button>
            <button
              type="button"
              className="hero-lens__nav hero-lens__nav--next"
              onClick={() => advanceRef.current("up")}
              aria-label="Next slide"
            >
              <span className="hero-lens__nav-arrow" aria-hidden>›</span>
            </button>
          </>
        )}
      </div>
    </section>
  );
}
