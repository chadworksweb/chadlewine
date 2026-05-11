"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import { MiniPlayer } from "./MiniPlayer";

export interface AlbumHeroItem {
  slug: string;
  title: string;
  releaseDate: string | null;
  artImagePath: string;
  artAlt: string;
  href: string;
  ctaLabel?: string;
  /** Focal point on the 1:1 cover (0-1). Defaults to centered. */
  focalX?: number;
  focalY?: number;
  zoom?: number;
  /** When present, renders a MiniPlayer above the CTA. */
  audio?: {
    songId: string;
    streamingUrl: string;
    durationSeconds: number;
  } | null;
}

interface Props {
  items: AlbumHeroItem[];
}

const TRANSITION_MS = 1100;
const TRANSITION_MS_MOBILE = 500;

export function AlbumHero({ items }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const lockoutRef = useRef(false);
  const total = items.length;

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const advance = useCallback(
    (dir: 1 | -1) => {
      if (lockoutRef.current || total <= 1) return;
      lockoutRef.current = true;
      setCurrentIndex((i) => (i + dir + total) % total);
      setTimeout(() => {
        lockoutRef.current = false;
      }, isMobile ? TRANSITION_MS_MOBILE : TRANSITION_MS);
    },
    [total, isMobile],
  );

  const advanceRef = useRef(advance);
  useEffect(() => {
    advanceRef.current = advance;
  }, [advance]);

  // Keyboard nav.
  useEffect(() => {
    if (total <= 1) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement) {
        const tag = e.target.tagName.toLowerCase();
        if (tag === "input" || tag === "textarea" || e.target.isContentEditable) return;
      }
      if (e.key === "ArrowRight") advanceRef.current(1);
      else if (e.key === "ArrowLeft") advanceRef.current(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [total]);

  if (total === 0) return null;

  return (
    <section className="album-hero">
      <div className="album-hero__viewport">
        {total > 1 && (
          <button
            type="button"
            className="album-hero__nav-tab album-hero__nav-tab--prev"
            onClick={() => advance(-1)}
            aria-label="Previous album"
          >
            <span aria-hidden>‹</span>
          </button>
        )}

        {items.map((item, i) => {
          // Shortest signed distance modulo total — wraps both directions
          // so item N-1 reads as offset -1 when current is 0, etc.
          let offset = i - currentIndex;
          if (offset > total / 2) offset -= total;
          else if (offset < -total / 2) offset += total;
          if (Math.abs(offset) > 1) return null;

          const role = offset === 0 ? "current" : offset < 0 ? "prev" : "next";
          const baseTranslate = role === "current" ? "0%" : role === "next" ? "100%" : "-100%";

          const year = item.releaseDate ? new Date(item.releaseDate).getFullYear() : null;
          const fx = item.focalX ?? 0.5;
          const fy = item.focalY ?? 0.5;
          const z = item.zoom && item.zoom >= 1 ? item.zoom : 1;
          const imgStyle: React.CSSProperties = { objectPosition: `${fx * 100}% ${fy * 100}%` };
          if (z !== 1) {
            imgStyle.transform = `scale(${z})`;
            imgStyle.transformOrigin = `${fx * 100}% ${fy * 100}%`;
          }

          return (
            <div
              key={item.slug}
              className={`album-hero__slide album-hero__slide--${role}`}
              style={{ transform: `translateX(${baseTranslate})` }}
              aria-hidden={role !== "current"}
            >
              <div className="album-hero__stage">
                <Link
                  href={item.href}
                  className="album-hero__cover-link"
                  aria-label={item.title}
                  tabIndex={role === "current" ? 0 : -1}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.artImagePath}
                    alt={item.artAlt || item.title}
                    className="album-hero__cover"
                    style={imgStyle}
                  />
                </Link>

                <div className="album-hero__meta">
                  <span className="hero-lens__kind hero-lens__kind--album album-hero__badge">album</span>
                  <h2 className="album-hero__title">
                    <Link
                      href={item.href}
                      className="album-hero__title-link"
                      tabIndex={role === "current" ? 0 : -1}
                    >
                      {item.title}
                    </Link>
                  </h2>
                  {year && <span className="album-hero__year">{year}</span>}
                  {item.audio && role === "current" && (
                    <div className="album-hero__mini-player">
                      <MiniPlayer
                        songId={item.audio.songId}
                        songSlug={item.slug}
                        streamingUrl={item.audio.streamingUrl}
                        trackNumber={1}
                        trackTitle={item.title}
                        durationSeconds={item.audio.durationSeconds}
                        artImagePath={item.artImagePath}
                        artAlt={item.artAlt}
                        playbackMode="preview"
                      />
                    </div>
                  )}
                  <Link
                    href={item.href}
                    className="album-hero__cta"
                    tabIndex={role === "current" ? 0 : -1}
                  >
                    {item.ctaLabel || "Open Album →"}
                  </Link>
                </div>
              </div>
            </div>
          );
        })}

        {total > 1 && (
          <button
            type="button"
            className="album-hero__nav-tab album-hero__nav-tab--next"
            onClick={() => advance(1)}
            aria-label="Next album"
          >
            <span aria-hidden>›</span>
          </button>
        )}
      </div>

      {/*
        Position indicator — circular cover thumbnails. Hidden for now, kept
        for re-enablement.
      {total > 1 && (
        <div className="album-hero__indicator" role="tablist">
          {items.map((it, i) => (
            <button
              key={it.slug}
              type="button"
              role="tab"
              aria-selected={i === currentIndex}
              aria-label={it.title}
              className={`album-hero__indicator-tile${i === currentIndex ? " album-hero__indicator-tile--active" : ""}`}
              onClick={() => {
                if (i === currentIndex || lockoutRef.current) return;
                lockoutRef.current = true;
                setCurrentIndex(i);
                setTimeout(() => {
                  lockoutRef.current = false;
                }, isMobile ? TRANSITION_MS_MOBILE : TRANSITION_MS);
              }}
            >
              <img src={it.artImagePath} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
      */}
    </section>
  );
}
