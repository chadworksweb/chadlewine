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
  zoom?: number; // >= 1
  categories?: { title: string; slug: string }[];
  tags?: { label: string; slug: string }[];
}

interface HeroLensProps {
  items: HeroLensItem[];
  onIndexChange?: (index: number) => void;
}

const SCROLL_THRESHOLD = 120;
const TRANSITION_MS = 1500;
const TRANSITION_MS_MOBILE = 350;

function HeroLensSlide({ item, isMobile }: { item: HeroLensItem; isMobile: boolean }) {
  const fx = item.focalX ?? 0.5;
  const fy = item.focalY ?? 0.5;
  const z = item.zoom && item.zoom >= 1 ? item.zoom : 1;
  const mobileStyle: React.CSSProperties = { objectPosition: `${fx * 100}% ${fy * 100}%` };
  if (z !== 1) {
    mobileStyle.transform = `scale(${z})`;
    mobileStyle.transformOrigin = `${fx * 100}% ${fy * 100}%`;
  }
  return (
    <>
      <div className="hero-lens__slide-art">
        {item.artImagePath && (
          isMobile ? (
            <img
              src={item.artImagePath}
              alt={item.artAlt || item.title}
              className="hero-lens__slide-img"
              style={mobileStyle}
              loading="eager"
            />
          ) : (
            <CoverArtPlayground
              src={item.artImagePath}
              alt={item.artAlt || item.title}
              className="cover-hero__art-wrap"
              focalX={item.focalX}
              focalY={item.focalY}
              zoom={item.zoom}
            />
          )
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
  const [isMobile, setIsMobile] = useState(false);

  const total = items.length;

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

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
    // Decide axis the first time either delta crosses a small threshold.
    // Horizontal must clearly dominate (>1.5x) AND exceed 12px before we
    // take control, so natural vertical scrolling passes through.
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
          onTouchStart={isMobile ? handleTouchStart : undefined}
          onTouchMove={isMobile ? handleTouchMove : undefined}
          onTouchEnd={isMobile ? handleTouchEnd : undefined}
        >
          {items.map((item, i) => {
            const offset = i - currentIndex;
            if (Math.abs(offset) > 1) return null;
            const translate = offset === 0 ? "0%" : offset < 0 ? "-100%" : "100%";
            const dragOffset = isMobile && isDragging ? ` + ${dragPx}px` : "";
            const transform = isMobile
              ? `translateX(calc(${translate}${dragOffset}))`
              : `translateY(${translate})`;
            return (
              <div
                key={item.slug}
                className={`hero-lens__slide${i === currentIndex ? " hero-lens__slide--current" : ""}`}
                style={{
                  transform,
                  transition: isMobile && isDragging ? "none" : undefined,
                  zIndex: i === currentIndex ? 2 : 1,
                }}
                aria-hidden={i !== currentIndex}
              >
                <HeroLensSlide item={item} isMobile={isMobile} />
              </div>
            );
          })}
        </div>

        <div
          ref={railRef}
          className="hero-lens__rail"
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
