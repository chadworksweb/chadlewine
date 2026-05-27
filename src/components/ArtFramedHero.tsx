"use client";

import { useState } from "react";
import "./ArtFramedHero.css";

interface Props {
  imagePath: string;
  imageAlt: string | null;
  title: string;
  galleryPaths?: string[] | null;
  /** "Sold" / "Reserved" ribbon, when the original is gone. */
  ribbon?: string | null;
}

// Art-detail hero: the piece hangs in a mock gallery frame and gently floats off
// the wall (soft drop shadow). Hover -- or tap-and-hold -- stills the float;
// press-and-drag on the art zooms toward the cursor and pans (a loupe). Gallery
// images appear as floating thumbnails (same spot as merch) and swap the piece.
export function ArtFramedHero({ imagePath, imageAlt, title, galleryPaths, ribbon }: Props) {
  const images = [imagePath, ...(galleryPaths || []).filter((p) => p && p !== imagePath)];
  const [active, setActive] = useState(imagePath);
  const [held, setHeld] = useState(false);
  // Hold-to-inspect: press on the art to zoom toward the cursor, drag to pan.
  const [zooming, setZooming] = useState(false);
  const [origin, setOrigin] = useState({ x: 50, y: 50 });

  function originFrom(e: React.PointerEvent) {
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100));
    const y = Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100));
    setOrigin({ x, y });
  }

  function startZoom(e: React.PointerEvent) {
    originFrom(e);
    setZooming(true);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* no-op */ }
  }

  function moveZoom(e: React.PointerEvent) {
    if (zooming) originFrom(e);
  }

  function endZoom() {
    setZooming(false);
  }

  return (
    <div
      className={`art-frame${held ? " is-held" : ""}`}
      onPointerDown={() => setHeld(true)}
      onPointerUp={() => setHeld(false)}
      onPointerCancel={() => setHeld(false)}
      onPointerLeave={() => setHeld(false)}
    >
      <div className="art-frame__floater">
        <div className="art-frame__frame">
          <div className="art-frame__mat">
            <div
              className={`art-frame__art${zooming ? " is-zooming" : ""}`}
              onPointerDown={startZoom}
              onPointerMove={moveZoom}
              onPointerUp={endZoom}
              onPointerCancel={endZoom}
              onPointerLeave={endZoom}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={active}
                src={active}
                alt={active === imagePath ? imageAlt || title : title}
                className="art-frame__art-img"
                draggable={false}
                decoding="async"
              />
              <span className="art-frame__glass" aria-hidden="true" />
            </div>
          </div>
        </div>
        {/* Ground shadow: counter-bobs so it reads as staying on the floor
            while the frame levitates above it. */}
        <div className="art-frame__shadow" aria-hidden="true" />
        {ribbon && <span className="art-frame__ribbon">{ribbon}</span>}
      </div>

      {/* Loupe overlay: while pressing, the piece pops out of the frame and
          zooms across the full column, panning with the cursor. Crossfades in
          and out so it eases between framed and zoomed. */}
      <div className={`art-frame__zoom${zooming ? " is-active" : ""}`} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={active}
          alt=""
          className="art-frame__zoom-img"
          draggable={false}
          style={{ transformOrigin: `${origin.x}% ${origin.y}%` }}
        />
      </div>

      {images.length > 1 && (
        <div className="product-detail__gallery product-detail__gallery--floating" role="list" aria-label="Artwork images">
          {images.map((src, i) => {
            const isActive = src === active;
            return (
              <button
                key={src + i}
                type="button"
                role="listitem"
                onClick={() => setActive(src)}
                className={`product-detail__thumb${isActive ? " product-detail__thumb--active" : ""}`}
                aria-current={isActive ? "true" : undefined}
                aria-label={i === 0 ? "Show the artwork" : `Show alternate view ${i}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" decoding="async" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
