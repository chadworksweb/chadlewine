"use client";

import { useRef, useState, useCallback } from "react";
import { focalCropStyle } from "@/lib/focal-crop";

export type CropRatio = "hero" | "card" | "portrait";

export interface CropValues {
  focalX: number | null;
  focalY: number | null;
  zoom: number | null;
}

export type Crops = Record<CropRatio, CropValues>;

export type CropPatch = Partial<CropValues>;

interface FocalPointPickerProps {
  src: string;
  alt: string;
  crops: Crops;
  onChange: (ratio: CropRatio, patch: CropPatch) => void;
  /** Which crop ratios to expose. Defaults to all three. Pass e.g. ["hero"]
   *  for entities that only have a hero crop target (merch, video). */
  ratios?: CropRatio[];
}

const RATIO_META: Record<CropRatio, { label: string; aspect: string; className: string }> = {
  hero: { label: "Hero · 1200×630", aspect: "1200 / 630", className: "focal-picker__preview--hero" },
  card: { label: "Card · 1:1", aspect: "1 / 1", className: "focal-picker__preview--square" },
  portrait: { label: "Portrait · 4:5", aspect: "4 / 5", className: "focal-picker__preview--portrait" },
};

export function FocalPointPicker({ src, alt, crops, onChange, ratios = ["hero", "card", "portrait"] }: FocalPointPickerProps) {
  const [active, setActive] = useState<CropRatio>(ratios[0] ?? "hero");
  const wrapRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const activeCrop = crops[active];
  const fx = activeCrop.focalX ?? 50;
  const fy = activeCrop.focalY ?? 50;
  const z = activeCrop.zoom && activeCrop.zoom >= 1 ? activeCrop.zoom : 1;

  const updateFromPoint = useCallback((clientX: number, clientY: number) => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const xPct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    const yPct = Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100));
    onChange(active, { focalX: Number(xPct.toFixed(2)), focalY: Number(yPct.toFixed(2)) });
  }, [onChange, active]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setDragging(true);
    updateFromPoint(e.clientX, e.clientY);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    updateFromPoint(e.clientX, e.clientY);
  };

  const stopDrag = () => setDragging(false);

  const handleTouch = (e: React.TouchEvent) => {
    if (e.touches.length === 0) return;
    updateFromPoint(e.touches[0].clientX, e.touches[0].clientY);
  };

  return (
    <div className="focal-picker">
      <div className="focal-picker__label">
        Editing <strong>{RATIO_META[active].label}</strong> — click a preview below to switch ratio. Click or drag the source for focal; slider for zoom.
      </div>

      <div
        ref={wrapRef}
        className="focal-picker__source"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={stopDrag}
        onMouseLeave={stopDrag}
        onTouchStart={handleTouch}
        onTouchMove={handleTouch}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- admin-only interactive picker; full image needed for click coords */}
        <img src={src} alt={alt} className="focal-picker__source-img" draggable={false} />
        <div className="focal-picker__dot" style={{ left: `${fx}%`, top: `${fy}%` }} />
      </div>

      <div className="focal-picker__zoom-row">
        <label className="focal-picker__zoom-label">Zoom</label>
        <input
          type="range"
          min="1"
          max="3"
          step="0.05"
          value={z}
          onChange={(e) => onChange(active, { zoom: parseFloat(e.target.value) })}
          className="focal-picker__zoom-slider"
        />
        <code className="focal-picker__zoom-value">{z.toFixed(2)}×</code>
        {z !== 1 && (
          <button
            type="button"
            className="admin-btn admin-btn--small"
            onClick={() => onChange(active, { zoom: 1 })}
          >
            Reset
          </button>
        )}
      </div>

      <div className="focal-picker__previews">
        {ratios.map((r) => {
          const c = crops[r];
          const isActive = active === r;
          return (
            <button
              key={r}
              type="button"
              className={`focal-picker__preview ${RATIO_META[r].className}${isActive ? " is-active" : ""}`}
              onClick={() => setActive(r)}
              aria-label={`Edit ${RATIO_META[r].label}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- admin-only crop preview */}
              <img
                src={src}
                alt={alt}
                className="focal-picker__preview-img"
                draggable={false}
                style={focalCropStyle(c.focalX, c.focalY, c.zoom)}
              />
              <span className="focal-picker__preview-label">{RATIO_META[r].label}</span>
            </button>
          );
        })}
      </div>

      <div className="focal-picker__meta">
        <code>x: {fx.toFixed(1)}% · y: {fy.toFixed(1)}% · {z.toFixed(2)}×</code>
        <button
          type="button"
          className="admin-btn admin-btn--small"
          onClick={() => onChange(active, { focalX: null, focalY: null, zoom: 1 })}
        >
          Reset {RATIO_META[active].label}
        </button>
      </div>
    </div>
  );
}
