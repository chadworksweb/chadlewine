"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { formatDimensions } from "@/lib/art-dimensions";
import "./GalleryWall.css";

/* Browse Chad Lewine Art -- a full-viewport virtual gallery wall.

   The wall is modeled at a real architectural scale (22ft x 14ft). Each piece
   is sized from its REAL measured size (width_in / height_in), so a 5ft canvas
   dwarfs an 8x10. Pieces are scattered like a salon hang and the whole thing is
   subtly digitized/glitchy -- the FRAMES read as tech wireframe, the art itself
   just flickers. Click a piece for a clean lightbox + a link to its detail page.

   Pieces without measured size fall back to a believable assumed size driven by
   the image's own aspect ratio, so the wall still hangs cleanly. */

export interface GalleryPiece {
  id: string;
  slug: string;
  title: string;
  image_path: string;
  width_in: number | null;
  height_in: number | null;
  depth_in: number | null;
  medium: string | null;
  year_created: number | null;
}

// Real wall, in inches. Kept intentionally tight so a modest hang fills it -- a
// bigger wall just reads as empty space around small pieces.
const WALL_W_IN = 14 * 12; // 168
const WALL_H_IN = 9 * 12; // 108
const EDGE_IN = 6; // keep pieces off the wall edges
const GAP_IN = 5; // minimum air between pieces
const PLACE_TRIES = 500; // rejection-sampling attempts per piece
const FALLBACK_LONGEST_IN = 26; // assumed size when a piece has no measured size

// A single piece glitches at a time, on a global cadence (ms).
const GLITCH_INTERVAL_MS = 3000;
const GLITCH_HOLD_MS = 360; // matches the gw-flicker keyframe duration

interface Placed {
  piece: GalleryPiece;
  xIn: number;
  yIn: number;
  wIn: number;
  hIn: number;
}

// Real-world size in inches: the LONGEST side comes from the measured dimensions
// (so scale varies believably), the SHAPE comes from the actual image so nothing
// is cropped or stretched.
function realSize(piece: GalleryPiece, aspect: number): { wIn: number; hIn: number } {
  const measured =
    piece.width_in != null && piece.height_in != null
      ? Math.max(piece.width_in, piece.height_in)
      : null;
  const longest = measured ?? FALLBACK_LONGEST_IN;
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
  const [glitchId, setGlitchId] = useState<string | null>(null);

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
          result.push({ piece, xIn: x, yIn: y, wIn, hIn });
          done = true;
        }
      }
    }
    setPlaced(result);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // One piece at a time glitches, on a steady global cadence -- so the wall reads
  // as a calm hang with a single occasional flicker, not a field of constant
  // blinking. Honors reduced-motion by never starting the cycle.
  useEffect(() => {
    if (placed.length === 0) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let holdTimer: ReturnType<typeof setTimeout>;
    const tick = window.setInterval(() => {
      const pick = placed[Math.floor(Math.random() * placed.length)];
      setGlitchId(pick.piece.id);
      holdTimer = setTimeout(() => setGlitchId(null), GLITCH_HOLD_MS);
    }, GLITCH_INTERVAL_MS);
    return () => {
      window.clearInterval(tick);
      clearTimeout(holdTimer);
    };
  }, [placed]);

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
                    className={"gw-art" + (glitchId === pl.piece.id ? " gw-art--glitch" : "")}
                    src={pl.piece.image_path}
                    alt={pl.piece.title}
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

  const meta = [piece.medium, formatDimensions(piece.width_in, piece.height_in, piece.depth_in), piece.year_created]
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
