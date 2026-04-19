"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { SlidingPortfolio, type PortfolioItem } from "@/lib/sliding-portfolio";
import "./SlidingArtPortfolio.css";

export function SlidingArtPortfolio({ items }: { items: PortfolioItem[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<SlidingPortfolio | null>(null);
  const [active, setActive] = useState<PortfolioItem | null>(null);
  const [displayItem, setDisplayItem] = useState<PortfolioItem | null>(null);
  const [galleryIndex, setGalleryIndex] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;
    const instance = new SlidingPortfolio(containerRef.current, {
      items,
      fullscreen: true,
      onItemClick: (item) => {
        setGalleryIndex(0);
        setActive(item);
      },
    });
    instanceRef.current = instance;
    return () => {
      instance.destroy();
      instanceRef.current = null;
    };
  }, [items]);

  useEffect(() => {
    instanceRef.current?.setPaused(!!active);
    if (active) {
      setDisplayItem(active);
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = prev; };
    }
    const t = setTimeout(() => setDisplayItem(null), 400);
    return () => clearTimeout(t);
  }, [active]);

  const close = useCallback(() => setActive(null), []);

  useEffect(() => {
    if (!active) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") setGalleryIndex((i) => Math.max(0, i - 1));
      else if (e.key === "ArrowRight") {
        setGalleryIndex((i) => {
          const len = active?.gallery.length ?? 0;
          return Math.min(len - 1, i + 1);
        });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, close]);

  const current = displayItem;
  const hasGallery = !!(current && current.gallery && current.gallery.length > 1);

  return (
    <div className="sarp-gallery-container sarp-fullscreen" ref={containerRef}>
      <div className="sarp-portfolio-viewport" data-sarp-viewport>
        <div className="sarp-portfolio-grid" data-sarp-grid></div>
      </div>
      <div className="sarp-portfolio-bezel"></div>

      <div
        className={`sarp-portfolio-modal${!hasGallery ? " sarp-single-image" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-hidden={active ? "false" : "true"}
        onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      >
        {current && (
          <>
            <button type="button" className="sarp-modal-close" onClick={close} aria-label="Close">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
            <div className="sarp-modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="sarp-modal-image-wrap">
                {hasGallery && (
                  <button
                    type="button"
                    className="sarp-modal-nav sarp-modal-prev"
                    onClick={() => setGalleryIndex((i) => Math.max(0, i - 1))}
                    disabled={galleryIndex === 0}
                    aria-label="Previous"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="15 18 9 12 15 6" />
                    </svg>
                  </button>
                )}
                <Image
                  className="sarp-modal-main-image"
                  src={current.gallery[galleryIndex] || current.main}
                  alt={current.title}
                  width={1600}
                  height={1600}
                  sizes="(max-width: 720px) 100vw, 1200px"
                  priority
                />
                {hasGallery && (
                  <button
                    type="button"
                    className="sarp-modal-nav sarp-modal-next"
                    onClick={() => setGalleryIndex((i) => Math.min(current.gallery.length - 1, i + 1))}
                    disabled={galleryIndex === current.gallery.length - 1}
                    aria-label="Next"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="9 6 15 12 9 18" />
                    </svg>
                  </button>
                )}
              </div>
              {hasGallery && (
                <div className="sarp-modal-thumbs">
                  {current.gallery.map((src, i) => (
                    <div
                      key={`${src}-${i}`}
                      className={`sarp-modal-thumb${i === galleryIndex ? " is-active" : ""}`}
                      onClick={() => setGalleryIndex(i)}
                    >
                      <Image src={src} alt="" width={200} height={200} sizes="80px" loading="lazy" />
                    </div>
                  ))}
                </div>
              )}
              <div className="sarp-modal-info">
                <h2 className="sarp-modal-title">{current.title}</h2>
                {current.meta && (current.meta.line1 || current.meta.line2 || current.meta.line3) && (
                  <div className="sarp-modal-meta">
                    {current.meta.line1 && <span>{current.meta.line1}</span>}
                    {current.meta.line2 && <span>{current.meta.line2}</span>}
                    {current.meta.line3 && <span>{current.meta.line3}</span>}
                  </div>
                )}
                <div className="sarp-modal-buy-section">
                  {current.sold && (
                    <div className="sarp-sold-badge sarp-sold-badge--sold">SOLD</div>
                  )}
                  <Link href={`/art/${current.slug}`} className="sarp-buy-btn">
                    View Details
                  </Link>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
