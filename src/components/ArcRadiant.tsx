"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

// ---------- Public data shapes ----------

export type ArcSong = {
  id: string;
  slug: string;
  title: string;
  release_date: string | null;
  write_date: string | null;
  song_state: string | null;
  status: string;
  instrumental: boolean;
  rc_charge: number | null;
  rc_tier: string | null;
};

export type ArcEra = {
  id: string;
  slug: string;
  title: string;
  kind: "life" | "release";
  date_start: string;
  date_end: string | null;
};

export type ArcLifeEvent = {
  id: string;
  slug: string;
  title: string;
  date_start: string | null;
  date_end: string | null;
  body_html: string;
};

export type ArcInitialData = {
  songs: ArcSong[];
  eras: ArcEra[];
  lifeEvents: ArcLifeEvent[];
  yearRange: [number, number];
};

// ---------- Constants ----------

const ZOOM_LEVELS: readonly number[] = [1, 2, 5, 10, 20, 35, 50];
const ZOOM_LABELS: Record<number, string> = {
  1: "Lifetime",
  2: "Decade",
  5: "Year",
  10: "Era",
  20: "Release",
  35: "Song",
  50: "Day",
};

const TIER_COLORS: Record<string, string> = {
  violet: "#9d6efb",
  blue: "#4d8fff",
  green: "#2dd07a",
  orange: "#ff9933",
  red: "#ff3b3b",
};

const LAYER_KEYS = ["music", "eras", "lifeEvents", "compass"] as const;
type LayerKey = (typeof LAYER_KEYS)[number];

const LAYER_LABELS: Record<LayerKey, string> = {
  music: "Music",
  eras: "Eras",
  lifeEvents: "Life Events",
  compass: "Compass Charge",
};

const PHASE_2_LAYERS = ["Visual Art", "Writing", "Geography", "Relationships", "Thematic Threads", "Industry Encounters"];

// Pre-catalog formation years are sparse (childhood, adolescence, pre-Pittsburgh).
// Collapse them into a compact band by default so the visible arc starts where
// the catalog and life-density actually does.
const COLLAPSE_END_YEAR = 2010;
const COLLAPSE_BAND_PX = 90;

// ---------- Component ----------

export function ArcRadiant({ data, proseAvailable = false }: { data: ArcInitialData; proseAvailable?: boolean }) {
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({
    music: true, eras: true, lifeEvents: true, compass: true,
  });
  const [selectedEvent, setSelectedEvent] = useState<ArcLifeEvent | null>(null);
  const [preCollapsed, setPreCollapsed] = useState(true);

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [yearStart, yearEnd] = data.yearRange;
  const yearSpan = yearEnd - yearStart;

  // Vertical canvas height = viewport * zoomLevel. At Lifetime (1x), the whole
  // arc fits in one viewport. At deeper levels, it scales up — page scrolls
  // naturally (no internal scroll container).
  const baseHeight = typeof window !== "undefined" ? Math.max(600, window.innerHeight - 160) : 800;
  const totalHeight = baseHeight * zoomLevel;
  const pxPerYear = totalHeight / yearSpan;

  // Pinch state (two-pointer)
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const lastPinchDistRef = useRef<number | null>(null);

  // Year-aggregated charge data
  const chargeByYear = useMemo(() => buildChargeByYear(data.songs, yearStart, yearEnd), [data.songs, yearStart, yearEnd]);

  // Mounted check (createPortal is browser-only)
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Snap to nearest zoom level
  function snapZoom(target: number): number {
    let best = ZOOM_LEVELS[0];
    let bestDist = Math.abs(target - best);
    for (const z of ZOOM_LEVELS) {
      const d = Math.abs(target - z);
      if (d < bestDist) { best = z; bestDist = d; }
    }
    return best;
  }

  function applyZoomDelta(factor: number) {
    setZoomLevel((current) => snapZoom(current * factor));
  }

  // Pointer-event pinch handler
  function onPointerDown(e: React.PointerEvent) {
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 2) {
      const [a, b] = Array.from(pointersRef.current.values());
      lastPinchDistRef.current = Math.hypot(b.x - a.x, b.y - a.y);
    }
  }
  function onPointerMove(e: React.PointerEvent) {
    const p = pointersRef.current.get(e.pointerId);
    if (!p) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 2 && lastPinchDistRef.current != null) {
      const [a, b] = Array.from(pointersRef.current.values());
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const ratio = dist / lastPinchDistRef.current;
      if (Math.abs(ratio - 1) > 0.05) {
        applyZoomDelta(ratio);
        lastPinchDistRef.current = dist;
      }
    }
  }
  function onPointerEnd(e: React.PointerEvent) {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) lastPinchDistRef.current = null;
  }

  // Ctrl + wheel zoom (desktop)
  function onWheel(e: React.WheelEvent) {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.5 : 1 / 1.5;
    applyZoomDelta(factor);
  }

  // Scroll the window to "now" on first mount (only — don't yank scroll on every
  // zoom change). Canvas is part of page document flow, no internal scroll.
  const didInitialScrollRef = useRef(false);
  useEffect(() => {
    if (didInitialScrollRef.current) return;
    const el = canvasRef.current;
    if (!el) return;
    const now = new Date();
    const nowFrac = (now.getFullYear() + now.getMonth() / 12 - yearStart) / yearSpan;
    const innerEl = el.querySelector(".arc-radiant__inner") as HTMLElement | null;
    if (!innerEl) return;
    const targetY = innerEl.offsetTop + totalHeight * nowFrac - window.innerHeight * 0.7;
    window.scrollTo({ top: Math.max(0, targetY), behavior: "instant" as ScrollBehavior });
    didInitialScrollRef.current = true;
  }, [totalHeight, yearStart, yearSpan]);

  // When pre-catalog years are collapsed: the 1989..COLLAPSE_END_YEAR span maps
  // into a fixed COLLAPSE_BAND_PX band at the top, and the rest of the timeline
  // claims the remaining height with year-level resolution. When expanded:
  // standard linear year-to-pixel mapping.
  const collapseActive = preCollapsed && COLLAPSE_END_YEAR > yearStart && COLLAPSE_END_YEAR < yearEnd;
  const postBandHeight = collapseActive ? totalHeight - COLLAPSE_BAND_PX : totalHeight;
  const pxPerPostYear = collapseActive ? postBandHeight / (yearEnd - COLLAPSE_END_YEAR) : pxPerYear;

  function yToYear(y: number): number {
    if (!collapseActive) return yearStart + y / pxPerYear;
    if (y < COLLAPSE_BAND_PX) {
      return yearStart + (y / COLLAPSE_BAND_PX) * (COLLAPSE_END_YEAR - yearStart);
    }
    return COLLAPSE_END_YEAR + (y - COLLAPSE_BAND_PX) / pxPerPostYear;
  }
  function dateToY(d: string | null): number | null {
    if (!d) return null;
    const [y, m = "1", day = "1"] = d.split("-");
    const year = parseInt(y, 10);
    const month = parseInt(m, 10);
    const dayN = parseInt(day, 10);
    const yearFloat = year + (month - 1) / 12 + (dayN - 1) / 365;
    if (collapseActive) {
      if (yearFloat < COLLAPSE_END_YEAR) {
        const frac = (yearFloat - yearStart) / (COLLAPSE_END_YEAR - yearStart);
        return frac * COLLAPSE_BAND_PX;
      }
      return COLLAPSE_BAND_PX + (yearFloat - COLLAPSE_END_YEAR) * pxPerPostYear;
    }
    return (yearFloat - yearStart) * pxPerYear;
  }

  return (
    <div className="arc-radiant">
      <div className="arc-radiant__toolbar">
        <div className="arc-radiant__zoom">
          <span className="arc-radiant__zoom-label">{ZOOM_LABELS[zoomLevel]}</span>
          <button onClick={() => applyZoomDelta(0.5)} aria-label="Zoom out">−</button>
          <button onClick={() => applyZoomDelta(2)} aria-label="Zoom in">+</button>
        </div>
        <div className="arc-radiant__toolbar-right">
          <span className="arc-radiant__layers-summary">
            {LAYER_KEYS.filter((k) => layers[k]).length} of {LAYER_KEYS.length} layers
          </span>
          {proseAvailable && (
            <Link href="/chad-lewine?view=prose" className="arc-radiant__view-switch">
              Switch to Prose →
            </Link>
          )}
        </div>
      </div>

      <div className="arc-radiant__main">
        <div
          ref={canvasRef}
          className="arc-radiant__canvas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onWheel={onWheel}
          style={{ touchAction: "pan-y" }}
        >
          <div className="arc-radiant__inner" style={{ height: totalHeight }}>
            {/* Central spine — the lifeline. Everything anchors here. */}
            <div className="arc-radiant__spine" />

            {/* Year axis (ticks span full width but kept faint).
                Inside the collapsed pre-catalog band, ticks are suppressed. */}
            <div className="arc-radiant__years">
              {Array.from({ length: yearSpan + 1 }, (_, i) => yearStart + i).map((year) => {
                if (collapseActive && year < COLLAPSE_END_YEAR) return null;
                const y = (dateToY(`${year}-01-01`) ?? 0);
                const showLabel = zoomLevel >= 5 || year % 5 === 0;
                return (
                  <div key={year} className="arc-radiant__year-tick" style={{ top: y }}>
                    {showLabel && <span className="arc-radiant__year-label">{year}</span>}
                  </div>
                );
              })}
            </div>

            {/* Collapsed pre-catalog band — clickable to expand */}
            {collapseActive && (
              <button
                className="arc-radiant__pre-band"
                style={{ height: COLLAPSE_BAND_PX }}
                onClick={() => setPreCollapsed(false)}
                title="Click to expand 1989-2009"
              >
                <span className="arc-radiant__pre-band-label">
                  {yearStart}–{COLLAPSE_END_YEAR - 1} · formation years
                </span>
                <span className="arc-radiant__pre-band-cta">expand ↓</span>
              </button>
            )}
            {!collapseActive && COLLAPSE_END_YEAR > yearStart && (
              <button
                className="arc-radiant__pre-collapse-cta"
                style={{ top: ((COLLAPSE_END_YEAR - yearStart) * pxPerYear) - 28 }}
                onClick={() => setPreCollapsed(true)}
                title="Click to collapse 1989-2009"
              >
                ↑ collapse {yearStart}–{COLLAPSE_END_YEAR - 1}
              </button>
            )}

            {/* Eras layer (background bands as absolute divs — more reliable than SVG % coords).
                Labels only show when the band has enough vertical room or zoom is high enough,
                otherwise multiple overlapping eras stack their labels and become unreadable. */}
            {layers.eras && data.eras.map((era) => {
              const y1 = dateToY(era.date_start);
              const y2 = dateToY(era.date_end ?? new Date().toISOString().slice(0, 10));
              if (y1 == null || y2 == null) return null;
              const height = Math.max(8, y2 - y1);
              const minLabelHeight = zoomLevel >= 5 ? 24 : zoomLevel >= 2 ? 80 : 200;
              const showLabel = height >= minLabelHeight;
              return (
                <div
                  key={era.id}
                  className={`arc-radiant__era arc-radiant__era--${era.kind}`}
                  style={{ top: y1, height }}
                >
                  {showLabel && (
                    <span className="arc-radiant__era-label">{era.title}</span>
                  )}
                </div>
              );
            })}

            {/* Compass charge line */}
            {layers.compass && chargeByYear.length > 1 && (
              <svg
                className="arc-radiant__layer arc-radiant__layer--compass"
                preserveAspectRatio="none"
                viewBox="0 0 100 100"
                style={{ height: totalHeight }}
              >
                <defs>
                  <linearGradient id="charge-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#9d6efb" />
                    <stop offset="25%" stopColor="#4d8fff" />
                    <stop offset="50%" stopColor="#2dd07a" />
                    <stop offset="75%" stopColor="#ff9933" />
                    <stop offset="100%" stopColor="#ff3b3b" />
                  </linearGradient>
                </defs>
                <ChargePath data={chargeByYear} yearStart={yearStart} yearSpan={yearSpan} />
              </svg>
            )}

            {/* Songs — anchor on the spine, branch right */}
            {layers.music && (() => {
              const items = data.songs
                .map((s) => ({ s, y: dateToY(s.write_date ?? s.release_date) }))
                .filter((e): e is { s: ArcSong; y: number } => e.y != null)
                .sort((a, b) => a.y - b.y);
              let lastLabelY = -Infinity;
              const labelBand = zoomLevel >= 5 ? 14 : zoomLevel >= 2 ? 18 : 26;
              return items.map(({ s, y }) => {
                const showLabel = zoomLevel >= 2 && y - lastLabelY > labelBand;
                if (showLabel) lastLabelY = y;
                const tierColor = s.rc_tier ? TIER_COLORS[s.rc_tier] : "var(--text-tertiary)";
                return (
                  <Link
                    key={s.id}
                    href={`/music/songs/${s.slug}`}
                    className="arc-radiant__branch arc-radiant__branch--right"
                    style={{ top: y }}
                    title={`${s.title}${s.song_state ? ` [${s.song_state}]` : ""}`}
                  >
                    <span className="arc-radiant__branch-dot" style={{ background: tierColor, borderColor: tierColor }} />
                    <span className="arc-radiant__branch-line" />
                    {showLabel && <span className="arc-radiant__branch-label">{s.title}</span>}
                  </Link>
                );
              });
            })()}

            {/* Life events — anchor on the spine, branch left */}
            {layers.lifeEvents && (() => {
              const events = data.lifeEvents
                .map((ev) => ({ ev, y: dateToY(ev.date_start) }))
                .filter((e): e is { ev: ArcLifeEvent; y: number } => e.y != null)
                .sort((a, b) => a.y - b.y);
              let lastLabelY = -Infinity;
              const labelBand = zoomLevel >= 5 ? 14 : zoomLevel >= 2 ? 22 : 32;
              return events.map(({ ev, y }) => {
                const showLabel = zoomLevel >= 2 && y - lastLabelY > labelBand;
                if (showLabel) lastLabelY = y;
                return (
                  <button
                    key={ev.id}
                    className="arc-radiant__branch arc-radiant__branch--left"
                    style={{ top: y }}
                    onClick={() => setSelectedEvent(ev)}
                    title={ev.title}
                  >
                    <span className="arc-radiant__branch-dot arc-radiant__branch-dot--event" />
                    <span className="arc-radiant__branch-line" />
                    {showLabel && <span className="arc-radiant__branch-label">{ev.title}</span>}
                  </button>
                );
              });
            })()}
          </div>
        </div>

        {/* Layer toggle panel */}
        <aside className="arc-radiant__layer-panel">
          <h3 className="arc-radiant__panel-title">Layers</h3>
          {LAYER_KEYS.map((k) => (
            <label key={k} className="arc-radiant__layer-toggle">
              <input
                type="checkbox"
                checked={layers[k]}
                onChange={(e) => setLayers((l) => ({ ...l, [k]: e.target.checked }))}
              />
              <span>{LAYER_LABELS[k]}</span>
            </label>
          ))}
          <h4 className="arc-radiant__panel-subtitle">Coming in v2</h4>
          {PHASE_2_LAYERS.map((label) => (
            <div key={label} className="arc-radiant__layer-toggle arc-radiant__layer-toggle--disabled">
              <input type="checkbox" disabled />
              <span>{label}</span>
            </div>
          ))}
        </aside>
      </div>

      {selectedEvent && mounted && createPortal(
        <div className="arc-radiant__detail-overlay" onClick={() => setSelectedEvent(null)}>
          <div className="arc-radiant__detail" onClick={(e) => e.stopPropagation()}>
            <button className="arc-radiant__detail-close" onClick={() => setSelectedEvent(null)} aria-label="Close">×</button>
            <h3>{selectedEvent.title}</h3>
            <div className="arc-radiant__detail-meta">{selectedEvent.date_start ?? "—"}</div>
            <div className="arc-radiant__detail-body" dangerouslySetInnerHTML={{ __html: selectedEvent.body_html }} />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ---------- Charge path subcomponent ----------

function ChargePath({ data, yearStart, yearSpan }: {
  data: { year: number; charge: number; n: number }[];
  yearStart: number;
  yearSpan: number;
}) {
  // Map year -> y in 0..100, charge -> x in 0..100 (centered at 50, range -100..+100)
  const points = data.map((d) => ({
    x: 50 + (d.charge / 100) * 40, // -100 → 10, +100 → 90
    y: ((d.year - yearStart) / yearSpan) * 100,
  }));
  if (points.length < 2) return null;

  // Smooth path via Catmull-Rom-ish quadratic curves
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cx = (prev.x + curr.x) / 2;
    const cy = (prev.y + curr.y) / 2;
    d += ` Q ${prev.x} ${prev.y}, ${cx} ${cy}`;
  }
  d += ` T ${points[points.length - 1].x} ${points[points.length - 1].y}`;

  return (
    <>
      <path d={d} stroke="url(#charge-gradient)" strokeWidth={1.2} fill="none" vectorEffect="non-scaling-stroke" />
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={0.6} fill="#fff" stroke="url(#charge-gradient)" strokeWidth={0.4} vectorEffect="non-scaling-stroke" />
      ))}
    </>
  );
}

// ---------- Aggregation ----------

function buildChargeByYear(songs: ArcSong[], yearStart: number, yearEnd: number) {
  const buckets: Record<number, { sum: number; n: number }> = {};
  for (const s of songs) {
    if (s.rc_charge == null || s.instrumental) continue;
    const date = s.release_date ?? s.write_date;
    if (!date) continue;
    const year = parseInt(date.slice(0, 4), 10);
    if (year < yearStart || year > yearEnd) continue;
    const b = buckets[year] ?? (buckets[year] = { sum: 0, n: 0 });
    b.sum += s.rc_charge;
    b.n += 1;
  }
  return Object.entries(buckets)
    .map(([y, b]) => ({ year: parseInt(y, 10), charge: b.sum / b.n, n: b.n }))
    .sort((a, b) => a.year - b.year);
}
