"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import "./GalleryWall.css";

/* Browse Chad Lewine Art -- a full-viewport virtual gallery wall.

   The wall is modeled at a real architectural scale (22ft x 14ft). Each piece
   is sized from its REAL dimensions (parsed from the `dimensions` text), so a
   5ft canvas dwarfs an 8x10. Pieces are scattered like a salon hang and the
   whole thing is subtly digitized/glitchy -- the FRAMES read as tech wireframe,
   the art itself just flickers. Click a piece for a clean lightbox + a link to
   its detail page.

   Pieces without parseable dimensions fall back to a believable assumed size
   driven by the image's own aspect ratio, so the wall still hangs cleanly. */

export interface GalleryPiece {
  id: string;
  slug: string;
  title: string;
  image_path: string;
  dimensions: string | null;
  medium: string | null;
  year_created: number | null;
}

// Real wall, in inches.
const WALL_W_IN = 22 * 12; // 264
const WALL_H_IN = 14 * 12; // 168
const EDGE_IN = 7; // keep pieces off the wall edges
const GAP_IN = 6; // minimum air between pieces
const PLACE_TRIES = 500; // rejection-sampling attempts per piece
const FALLBACK_LONGEST_IN = 26; // assumed size when dimensions don't parse

interface Placed {
  piece: GalleryPiece;
  xIn: number;
  yIn: number;
  wIn: number;
  hIn: number;
  delay: string; // flicker desync
}

// "36x48in" | "36 x 48 in" | "3ft x 2ft" | '36"x48"' -> { w, h } inches.
function parseDims(s: string | null): { w: number; h: number } | null {
  if (!s) return null;
  const m = s
    .toLowerCase()
    .replace(/\s+/g, "")
    .match(/(\d+(?:\.\d+)?)(in|"|cm|ft|')?(?:x|×|by)(\d+(?:\.\d+)?)(in|"|cm|ft|')?/);
  if (!m) return null;
  let w = parseFloat(m[1]);
  let h = parseFloat(m[3]);
  const unit = m[4] || m[2];
  if (unit === "ft" || unit === "'") {
    w *= 12;
    h *= 12;
  } else if (unit === "cm") {
    w /= 2.54;
    h /= 2.54;
  }
  if (!isFinite(w) || !isFinite(h) || w <= 0 || h <= 0) return null;
  return { w, h };
}

// Real-world size in inches: the LONGEST side comes from the dimensions (so
// scale varies believably), the SHAPE comes from the actual image so nothing
// is cropped or stretched.
function realSize(piece: GalleryPiece, aspect: number): { wIn: number; hIn: number } {
  const dims = parseDims(piece.dimensions);
  const longest = dims ? Math.max(dims.w, dims.h) : FALLBACK_LONGEST_IN;
  if (aspect >= 1) return { wIn: longest, hIn: longest / aspect };
  return { wIn: longest * aspect, hIn: longest };
}

function overlaps(a: Placed, x: number, y: number, w: number, h: number): boolean {
  return (
    x < a.xIn + a.wIn + GAP_IN &&
    x + w + GAP_IN > a.xIn &&
    y < a.yIn + a.hIn + GAP_IN &&
    y + h + GAP_IN > a.yIn
  );
}

export function GalleryWall({ pieces }: { pieces: GalleryPiece[] }) {
  const wallRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [aspects, setAspects] = useState<Record<string, number>>({});
  const [placed, setPlaced] = useState<Placed[]>([]);
  const [selected, setSelected] = useState<GalleryPiece | null>(null);

  // Measure the wall surface (drives the px-per-inch scale; re-runs on resize).
  useEffect(() => {
    const el = wallRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Preload each image just to learn its natural aspect ratio.
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      pieces.map(
        (p) =>
          new Promise<[string, number]>((resolve) => {
            const img = new window.Image();
            img.onload = () =>
              resolve([p.id, img.naturalWidth / img.naturalHeight || 1]);
            img.onerror = () => resolve([p.id, 1]);
            img.src = p.image_path;
          }),
      ),
    ).then((entries) => {
      if (!cancelled) setAspects(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [pieces]);

  // Place pieces ONCE per load, in wall (inch) coordinates. Re-scaling on resize
  // is just a multiply by ppi at render time, so positions stay put. Each load
  // reshuffles, so the hang looks freshly arranged every visit.
  const ready = pieces.length > 0 && Object.keys(aspects).length >= pieces.length;
  useEffect(() => {
    if (!ready) return;
    const order = [...pieces].sort(() => Math.random() - 0.5);
    const result: Placed[] = [];
    for (const piece of order) {
      const { wIn, hIn } = realSize(piece, aspects[piece.id] ?? 1);
      const maxX = WALL_W_IN - EDGE_IN - wIn;
      const maxY = WALL_H_IN - EDGE_IN - hIn;
      if (maxX <= EDGE_IN || maxY <= EDGE_IN) continue; // too big to hang
      let done = false;
      for (let t = 0; t < PLACE_TRIES && !done; t++) {
        const x = EDGE_IN + Math.random() * (maxX - EDGE_IN);
        const y = EDGE_IN + Math.random() * (maxY - EDGE_IN);
        if (result.every((p) => !overlaps(p, x, y, wIn, hIn))) {
          result.push({
            piece,
            xIn: x,
            yIn: y,
            wIn,
            hIn,
            delay: `-${(Math.random() * 8).toFixed(2)}s`,
          });
          done = true;
        }
      }
    }
    setPlaced(result);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // px-per-inch: contain the whole wall in the surface; center the hang region.
  const layout = useMemo(() => {
    if (!size) return null;
    const ppi = Math.min(size.w / WALL_W_IN, size.h / WALL_H_IN);
    const offX = (size.w - WALL_W_IN * ppi) / 2;
    const offY = (size.h - WALL_H_IN * ppi) / 2;
    return { ppi, offX, offY };
  }, [size]);

  const close = useCallback(() => setSelected(null), []);

  return (
    <section className="gallery-wall" aria-label="Browse Chad Lewine Art">
      <div className="glyph-title-bar glyph-title-bar--top gallery-wall__title">
        <span className="glyph-title-bar__label" aria-hidden="true">░▒▓█</span>
        <h2 className="glyph-title-bar__heading">Browse Chad Lewine Art</h2>
        <span className="glyph-title-bar__label" aria-hidden="true">█▓▒░</span>
      </div>

      <div className="gallery-wall__surface" ref={wallRef}>
        <div className="gallery-wall__scan" aria-hidden="true" />
        <div className="gallery-wall__glitch" aria-hidden="true" />

        {layout &&
          placed.map((pl) => {
            const style = {
              left: layout.offX + pl.xIn * layout.ppi,
              top: layout.offY + pl.yIn * layout.ppi,
              width: pl.wIn * layout.ppi,
              height: pl.hIn * layout.ppi,
            };
            return (
              <button
                key={pl.piece.id}
                type="button"
                className="gw-piece"
                style={style}
                onClick={() => setSelected(pl.piece)}
                aria-label={`View ${pl.piece.title}`}
              >
                <span className="gw-frame">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className="gw-art"
                    src={pl.piece.image_path}
                    alt={pl.piece.title}
                    style={{ animationDelay: pl.delay }}
                    draggable={false}
                  />
                </span>
              </button>
            );
          })}

        <p className="gallery-wall__hint" aria-hidden="true">
          shown to scale &middot; click any piece
        </p>
      </div>

      {selected && <Lightbox piece={selected} onClose={close} />}
    </section>
  );
}

function Lightbox({ piece, onClose }: { piece: GalleryPiece; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const meta = [piece.medium, piece.dimensions, piece.year_created]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="gw-lightbox" onClick={onClose} role="dialog" aria-modal="true">
      <div className="gw-lightbox__panel" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="gw-lightbox__close"
          onClick={onClose}
          aria-label="Close"
        >
          &times;
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="gw-lightbox__img" src={piece.image_path} alt={piece.title} />
        <div className="gw-lightbox__meta">
          <h3 className="gw-lightbox__title">{piece.title}</h3>
          {meta && <p className="gw-lightbox__sub">{meta}</p>}
          <Link href={`/art/${piece.slug}`} className="gw-lightbox__cta">
            View piece &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
}
