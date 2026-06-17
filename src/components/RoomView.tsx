"use client";

import { useState } from "react";
import "./RoomView.css";

// Our custom in-situ. The artwork is composited onto a calibrated empty-room
// backplate at its true size: artwork width as a fraction of the backplate width =
// (widthIn * px_per_inch) / backplate natural pixel width. That ratio is resolution-
// and viewport-independent, so once we know the backplate's naturalWidth (read on
// load) the piece stays true-to-scale at any container size. The model that made the
// room never touches the art; the composite is plain CSS.

export interface RoomScene {
  slug: string;
  name: string;
  image_path: string;
  px_per_inch: number;
  anchor_x_pct: number;
  anchor_y_pct: number;
  wall_min_width_in: number | null;
  wall_max_width_in: number | null;
  light_warmth: string | null;
}

interface Props {
  imagePath: string;
  imageAlt: string | null;
  title: string;
  widthIn: number;
  heightIn: number;
  depthIn?: number | null;
  scenes: RoomScene[];
}

function fmt(n: number): string {
  // 24.00 -> "24", 24.50 -> "24.5"
  return Number.isInteger(n) ? String(n) : String(parseFloat(n.toFixed(2)));
}

export function RoomView({ imagePath, imageAlt, title, widthIn, heightIn, scenes }: Props) {
  // Size tiering: a piece only sees rooms that flatter its size. Keep a scene when the
  // piece width falls inside its [wall_min_width_in, wall_max_width_in] window; a null
  // bound is open on that side. A small piece lands in intimate situations, a statement
  // piece on big walls, and the math stays the same -- this only curates which scenes show.
  const usable = scenes.filter(
    (s) =>
      s.image_path &&
      s.px_per_inch &&
      widthIn >= (s.wall_min_width_in ?? 0) &&
      (s.wall_max_width_in == null || widthIn <= s.wall_max_width_in),
  );
  const [activeSlug, setActiveSlug] = useState(usable[0]?.slug ?? "");
  const [framed, setFramed] = useState(true);
  const [natW, setNatW] = useState<Record<string, number>>({});

  if (usable.length === 0) return null;
  const scene = usable.find((s) => s.slug === activeSlug) ?? usable[0];

  // Capture the backplate's natural pixel width. Use both a ref callback (for images
  // already cached/complete before React attaches a listener) and onLoad (for fresh
  // loads), so the artwork layer always gets its scale source.
  const captureNat = (el: HTMLImageElement | null) => {
    if (el && el.complete && el.naturalWidth > 0) {
      setNatW((prev) => (prev[scene.slug] ? prev : { ...prev, [scene.slug]: el.naturalWidth }));
    }
  };

  const nw = natW[scene.slug];
  const widthPct = nw ? ((widthIn * scene.px_per_inch) / nw) * 100 : null;

  return (
    <figure className="room-view">
      <div className="room-view__stage">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={scene.slug}
          ref={captureNat}
          src={scene.image_path}
          alt=""
          className="room-view__bg"
          draggable={false}
          decoding="async"
          onLoad={(e) => captureNat(e.currentTarget)}
        />

        {widthPct != null && (
          <div
            className={`room-view__art${framed ? " is-framed" : ""}`}
            style={{
              width: `${widthPct}%`,
              left: `${scene.anchor_x_pct}%`,
              top: `${scene.anchor_y_pct}%`,
              aspectRatio: `${widthIn} / ${heightIn}`,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imagePath} alt={imageAlt || title} className="room-view__art-img" draggable={false} />
          </div>
        )}
      </div>

      <div className="room-view__controls">
        <div className="room-view__scenes" role="tablist" aria-label="Room">
          {usable.map((s) => (
            <button
              key={s.slug}
              type="button"
              role="tab"
              aria-selected={s.slug === scene.slug}
              className={`room-view__chip${s.slug === scene.slug ? " is-active" : ""}`}
              onClick={() => setActiveSlug(s.slug)}
            >
              {s.name}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="room-view__toggle"
          onClick={() => setFramed((f) => !f)}
          aria-pressed={framed}
        >
          {framed ? "Show unframed" : "Show framed"}
        </button>
      </div>

      <figcaption className="room-view__caption">
        Shown at actual size: {fmt(widthIn)} x {fmt(heightIn)} in
      </figcaption>
    </figure>
  );
}
