"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

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

export type ArcRelease = {
  id: string;
  slug: string;
  title: string;
  release_date: string | null;
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
  albums: ArcRelease[];
  eras: ArcEra[];
  lifeEvents: ArcLifeEvent[];
  yearRange: [number, number];
};

type SelectedItem =
  | { type: "song"; data: ArcSong }
  | { type: "release"; data: ArcRelease }
  | { type: "event"; data: ArcLifeEvent }
  | null;

// ---------- Constants ----------

// Zoom is continuous between MIN and MAX. The named bands below are just
// readable labels for the current scale — they don't snap the value.
const ZOOM_MIN = 1;
const ZOOM_MAX = 80;

function zoomLabel(z: number): string {
  if (z < 1.5) return "Lifetime";
  if (z < 3.5) return "Decade";
  if (z < 7.5) return "Year";
  if (z < 15) return "Era";
  if (z < 28) return "Release";
  if (z < 45) return "Song";
  return "Day";
}

// Exact tier colors from Rising Compass — keeps the chadlewine arc visually
// consistent with the per-song dots and the RC aggregate chart gradient.
const TIER_COLORS: Record<string, string> = {
  violet: "#aa54ff",
  blue: "#3388ff",
  green: "#33cc55",
  orange: "#ffbb33",
  red: "#ff3333",
};
const TIER_ORDER: ReadonlyArray<keyof typeof TIER_COLORS> = ["violet", "blue", "green", "orange", "red"];

const LAYER_KEYS = ["music", "lifeEvents", "lifeEras", "releaseEras", "compass"] as const;
type LayerKey = (typeof LAYER_KEYS)[number];

const LAYER_LABELS: Record<LayerKey, string> = {
  music: "Music",
  lifeEvents: "Life Events",
  lifeEras: "Life Eras",
  releaseEras: "Album Eras",
  compass: "Compass Charge",
};

// Visual canvas height: graphics live above the centerline, year strip + spine
// sit at the bottom (the "horizon"). Canvas height is responsive — scales with
// viewport so the layers always have generous vertical space.
const CANVAS_HEIGHT_MIN = 480;
const SPINE_RESERVED_PX = 40; // bottom strip reserved for year ticks + labels

// Era zone — stacked just above the spine. Two sub-rows per kind keep adjacent
// eras visually separated even when their date ranges are tight.
const ERA_ROW_HEIGHT = 22;
const ERA_ROW_GAP = 2;
const ERA_LIFE_ROW_BOTTOM = SPINE_RESERVED_PX + 6;
const ERA_RELEASE_ROW_BOTTOM = ERA_LIFE_ROW_BOTTOM + 2 * (ERA_ROW_HEIGHT + ERA_ROW_GAP) + 8;
// Total era zone reserved height above spine
const ERA_ZONE_TOP = ERA_RELEASE_ROW_BOTTOM + 2 * (ERA_ROW_HEIGHT + ERA_ROW_GAP);

// Branch zone — dots and labels live here, well above the era zone so the
// layers don't overlap visually. Patterns span this zone with wide variation.
const BRANCH_BOTTOM = ERA_ZONE_TOP + 12;
const BRANCH_TOP_PADDING = 30;

// Heights are written from spine. Branches with `bottom: SPINE_RESERVED_PX`
// rise upward by `branchHeight`. So height = position-of-dot above spine.
// The patterns below land dots well above the era zone.
const SONG_HEIGHT_PATTERN = [220, 340, 280, 420, 200, 380, 260, 450, 240, 360, 300, 410, 320, 230, 390];
const ALBUM_HEIGHT_PATTERN = [430, 380, 460, 410, 350, 440];
const EVENT_HEIGHT_PATTERN = [180, 300, 240, 380, 210, 330, 270, 410, 190, 350, 290];

// ---------- Component ----------

export function ArcRadiant({ data, proseAvailable = false }: { data: ArcInitialData; proseAvailable?: boolean }) {
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({
    music: true, lifeEvents: true, lifeEras: true, releaseEras: true, compass: true,
  });
  const [selectedItem, setSelectedItem] = useState<SelectedItem>(null);
  const [hover, setHover] = useState<{ title: string; x: number; y: number } | null>(null);

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [yearStart, yearEnd] = data.yearRange;
  const yearSpan = Math.max(1, yearEnd - yearStart);

  // Sizing — start with stable SSR values, sync to viewport after mount to
  // avoid hydration mismatches. Width scales with viewport (deeper zoom →
  // wider total width → horizontal scroll). Canvas height also scales with
  // viewport so layers always get generous breathing room.
  const [baseWidth, setBaseWidth] = useState<number>(1200);
  const [canvasHeight, setCanvasHeight] = useState<number>(540);
  useEffect(() => {
    function update() {
      setBaseWidth(Math.max(900, window.innerWidth - 60));
      setCanvasHeight(Math.max(CANVAS_HEIGHT_MIN, window.innerHeight - 280));
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  const totalWidth = baseWidth * zoomLevel;
  const pxPerYear = totalWidth / yearSpan;
  const branchTop = canvasHeight - BRANCH_TOP_PADDING;
  function clamp(h: number): number {
    return Math.max(BRANCH_BOTTOM, Math.min(branchTop, h));
  }

  // Pinch state (two-pointer)
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const lastPinchDistRef = useRef<number | null>(null);

  const chargeByYear = useMemo(() => buildChargeByYear(data.songs, yearStart, yearEnd), [data.songs, yearStart, yearEnd]);

  // Vertical labels are ~14px wide. Two labels collide when their x-bands
  // overlap. Greedy claim: walk most-recent-first, claim each x-band; skip
  // labels whose band is already taken. This naturally hides older/duplicate
  // labels while preserving the most recent ones at every zoom level.
  const LABEL_WIDTH_PX = 16;
  function pickVisibleLabels<T extends { id: string; date: string | null; x: number }>(items: T[]): Set<string> {
    const sorted = [...items].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    const claimed: Array<[number, number]> = [];
    const visible = new Set<string>();
    for (const item of sorted) {
      const lo = item.x - LABEL_WIDTH_PX / 2;
      const hi = item.x + LABEL_WIDTH_PX / 2;
      if (claimed.some(([a, b]) => lo < b && hi > a)) continue;
      claimed.push([lo, hi]);
      visible.add(item.id);
    }
    return visible;
  }

  // Pre-sort eras by kind + date, fill in missing date_end values from the
  // NEXT same-kind era's date_start (or today if last). Most release eras come
  // from the discography ingest with no explicit "Era: Month - Month" window,
  // so date_end arrives null. Without chaining, every dateless era would
  // stretch from its start all the way to today and they'd all visually
  // overlap. Adjacent same-kind eras also alternate sub-rows so labels don't
  // pile up when date ranges are still tight.
  const stackedEras = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    function chain(eras: ArcEra[]) {
      const sorted = [...eras].sort((a, b) => a.date_start.localeCompare(b.date_start));
      return sorted.map((era, i) => {
        const nextStart = sorted[i + 1]?.date_start ?? today;
        // Honor an explicit date_end if present; otherwise cap to next era's start.
        const effectiveEnd = era.date_end && era.date_end < nextStart ? era.date_end : nextStart;
        return { era, effectiveEnd, subRow: i % 2 };
      });
    }
    return [
      ...chain(data.eras.filter((e) => e.kind === "life")),
      ...chain(data.eras.filter((e) => e.kind === "release")),
    ];
  }, [data.eras]);

  function applyZoomDelta(factor: number) {
    setZoomLevel((current) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, current * factor)));
  }

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
      // Apply every frame for fluid zoom; no threshold gate (which used to
      // produce a jittery, stepped feel).
      applyZoomDelta(ratio);
      lastPinchDistRef.current = dist;
    }
  }
  function onPointerEnd(e: React.PointerEvent) {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) lastPinchDistRef.current = null;
  }


  function dateToX(d: string | null | undefined): number | null {
    if (!d) return null;
    const [y, m = "1", day = "1"] = d.split("-");
    const year = parseInt(y, 10);
    const month = parseInt(m, 10);
    const dayN = parseInt(day, 10);
    if (Number.isNaN(year)) return null;
    const yearFloat = year + (month - 1) / 12 + (dayN - 1) / 365;
    return (yearFloat - yearStart) * pxPerYear;
  }

  // Initial horizontal scroll to "now" — only on first mount.
  const didInitialScrollRef = useRef(false);
  useEffect(() => {
    if (didInitialScrollRef.current) return;
    const el = canvasRef.current;
    if (!el) return;
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const targetX = dateToX(today);
    if (targetX != null) {
      el.scrollLeft = Math.max(0, targetX - el.clientWidth * 0.7);
    }
    didInitialScrollRef.current = true;
  }, [totalWidth]);

  return (
    <div className="arc-radiant">
      <div className="arc-radiant__toolbar">
        <span className="arc-radiant__zoom-hint" aria-hidden="true">
          Pinch on mobile · ± buttons on desktop
        </span>
        <div className="arc-radiant__toolbar-right">
          {proseAvailable && (
            <Link href="/chad-lewine?view=prose" className="arc-radiant__view-switch">
              Switch to Prose →
            </Link>
          )}
          <div className="arc-radiant__zoom">
            <span className="arc-radiant__zoom-label">{zoomLabel(zoomLevel)}</span>
            <button onClick={() => applyZoomDelta(1 / 1.4)} aria-label="Zoom out">−</button>
            <button onClick={() => applyZoomDelta(1.4)} aria-label="Zoom in">+</button>
          </div>
        </div>
      </div>

      <div className="arc-radiant__upper">
        <aside className="arc-radiant__key" aria-label="Layer key">
          <h3 className="arc-radiant__key-title">Key</h3>
          {LAYER_KEYS.map((k) => (
            <label
              key={k}
              className={`arc-radiant__key-row arc-radiant__key-row--${k}${layers[k] ? "" : " is-off"}`}
            >
              <input
                type="checkbox"
                checked={layers[k]}
                onChange={(e) => setLayers((l) => ({ ...l, [k]: e.target.checked }))}
              />
              <span className="arc-radiant__key-swatch" aria-hidden="true">
                <KeySwatch layer={k} />
              </span>
              <span className="arc-radiant__key-label">{LAYER_LABELS[k]}</span>
            </label>
          ))}
        </aside>

        <div
          ref={canvasRef}
          className="arc-radiant__canvas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          style={{ touchAction: "pan-x" }}
        >
          <div
            className="arc-radiant__inner"
            style={{ width: totalWidth, height: canvasHeight }}
          >
            {/* Horizontal centerline — the timeline / horizon */}
            <div className="arc-radiant__spine" style={{ bottom: SPINE_RESERVED_PX }} />

            {/* Year ticks rise from the centerline; labels sit just below it */}
            <div className="arc-radiant__years">
              {Array.from({ length: yearSpan + 1 }, (_, i) => yearStart + i).map((year) => {
                const x = dateToX(`${year}-01-01`) ?? 0;
                const showLabel = zoomLevel >= 5 || year % 5 === 0;
                return (
                  <div
                    key={year}
                    className="arc-radiant__year-tick"
                    style={{ left: x, bottom: 0, height: SPINE_RESERVED_PX + 8 }}
                  >
                    {showLabel && <span className="arc-radiant__year-label">{year}</span>}
                  </div>
                );
              })}
            </div>

            {/* Eras: horizontal segments, life kind sits in lower band, release
                kind in upper band — well separated so the two don't merge.
                Within a kind, adjacent eras alternate sub-rows so their labels
                don't pile up when date ranges are tight. */}
            {stackedEras.map(({ era, effectiveEnd, subRow }) => {
              if (era.kind === "life" && !layers.lifeEras) return null;
              if (era.kind === "release" && !layers.releaseEras) return null;
              const x1 = dateToX(era.date_start);
              const x2 = dateToX(effectiveEnd);
              if (x1 == null || x2 == null) return null;
              const width = Math.max(8, x2 - x1);
              const minLabelWidth = zoomLevel >= 5 ? 60 : zoomLevel >= 2 ? 120 : 180;
              const showLabel = width >= minLabelWidth;
              const baseBottom = era.kind === "life" ? ERA_LIFE_ROW_BOTTOM : ERA_RELEASE_ROW_BOTTOM;
              const bottomOffset = baseBottom + subRow * (ERA_ROW_HEIGHT + ERA_ROW_GAP);
              return (
                <div
                  key={era.id}
                  className={`arc-radiant__era arc-radiant__era--${era.kind}`}
                  style={{ left: x1, width, bottom: bottomOffset, height: ERA_ROW_HEIGHT }}
                >
                  {showLabel && (
                    <span className="arc-radiant__era-label">{era.title}</span>
                  )}
                </div>
              );
            })}

            {/* Compass charge — horizontal SVG ribbon. y=0 is centerline,
                positive charge bulges UP, negative bulges DOWN (here, since
                only top half is visible, negative just dips toward the spine). */}
            {layers.compass && chargeByYear.length > 1 && (
              <svg
                className="arc-radiant__layer arc-radiant__layer--compass"
                preserveAspectRatio="none"
                viewBox="0 0 100 100"
                style={{
                  width: totalWidth,
                  height: branchTop,
                  bottom: SPINE_RESERVED_PX,
                }}
              >
                <defs>
                  {/* Top of curve = violet (high charge), bottom = red (low),
                      matching the RC aggregate chart's tier gradient. */}
                  <linearGradient id="charge-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%"   stopColor="#aa54ff" />
                    <stop offset="25%"  stopColor="#3388ff" />
                    <stop offset="50%"  stopColor="#33cc55" />
                    <stop offset="75%"  stopColor="#ffbb33" />
                    <stop offset="100%" stopColor="#ff3333" />
                  </linearGradient>
                </defs>
                <ChargePath data={chargeByYear} yearStart={yearStart} yearSpan={yearSpan} />
              </svg>
            )}

            {/* Songs — vertical branches rising from spine. Tier color drives
                the CD ring color; labels run vertically up from each dot, with
                collision-aware visibility so the most recent never gets hidden
                behind older duplicates at the same x. */}
            {layers.music && (() => {
              const items = data.songs
                .map((s, i) => ({ s, i, x: dateToX(s.write_date ?? s.release_date) }))
                .filter((e): e is { s: ArcSong; i: number; x: number } => e.x != null)
                .sort((a, b) => a.x - b.x);
              const visibleLabels = pickVisibleLabels(items.map(({ s, x }) => ({
                id: s.id, date: s.write_date ?? s.release_date, x,
              })));
              return items.map(({ s, i, x }) => {
                const branchHeight = clamp(SONG_HEIGHT_PATTERN[i % SONG_HEIGHT_PATTERN.length]);
                const showLabel = zoomLevel >= 2 && visibleLabels.has(s.id);
                const tierColor = s.rc_tier ? TIER_COLORS[s.rc_tier] : "var(--arc-gold-bright)";
                const isSelected = selectedItem?.type === "song" && selectedItem.data.id === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={`arc-radiant__branch arc-radiant__branch--song${isSelected ? " is-selected" : ""}`}
                    style={{ left: x, bottom: SPINE_RESERVED_PX, height: branchHeight }}
                    onClick={() => setSelectedItem({ type: "song", data: s })}
                    onPointerEnter={(e) => setHover({ title: s.title, x: e.clientX, y: e.clientY })}
                    onPointerMove={(e) => setHover({ title: s.title, x: e.clientX, y: e.clientY })}
                    onPointerLeave={() => setHover(null)}
                  >
                    <span className="arc-radiant__branch-line" style={{ height: branchHeight - 8 }} />
                    <span
                      className="arc-radiant__cd arc-radiant__cd--single"
                      style={{ background: tierColor, borderColor: tierColor }}
                    />
                    {showLabel && <span className="arc-radiant__branch-label">{s.title}</span>}
                  </button>
                );
              });
            })()}

            {/* Albums — same CD icon as singles (slightly larger), placed at
                the album's release_date. Differentiation between singles and
                albums beyond size will come later. */}
            {layers.music && (() => {
              const items = data.albums
                .map((a, i) => ({ a, i, x: dateToX(a.release_date) }))
                .filter((e): e is { a: ArcRelease; i: number; x: number } => e.x != null)
                .sort((a, b) => a.x - b.x);
              const visibleLabels = pickVisibleLabels(items.map(({ a, x }) => ({
                id: a.id, date: a.release_date, x,
              })));
              return items.map(({ a, i, x }) => {
                const branchHeight = clamp(ALBUM_HEIGHT_PATTERN[i % ALBUM_HEIGHT_PATTERN.length]);
                const showLabel = zoomLevel >= 2 && visibleLabels.has(a.id);
                const isSelected = selectedItem?.type === "release" && selectedItem.data.id === a.id;
                return (
                  <button
                    key={a.id}
                    type="button"
                    className={`arc-radiant__branch arc-radiant__branch--album${isSelected ? " is-selected" : ""}`}
                    style={{ left: x, bottom: SPINE_RESERVED_PX, height: branchHeight }}
                    onClick={() => setSelectedItem({ type: "release", data: a })}
                    onPointerEnter={(e) => setHover({ title: a.title, x: e.clientX, y: e.clientY })}
                    onPointerMove={(e) => setHover({ title: a.title, x: e.clientX, y: e.clientY })}
                    onPointerLeave={() => setHover(null)}
                  >
                    <span className="arc-radiant__branch-line" style={{ height: branchHeight - 12 }} />
                    <span className="arc-radiant__cd arc-radiant__cd--album" />
                    {showLabel && <span className="arc-radiant__branch-label">{a.title}</span>}
                  </button>
                );
              });
            })()}

            {/* Life events — vertical branches rising from spine, complementary green dots */}
            {layers.lifeEvents && (() => {
              const events = data.lifeEvents
                .map((ev, i) => ({ ev, i, x: dateToX(ev.date_start) }))
                .filter((e): e is { ev: ArcLifeEvent; i: number; x: number } => e.x != null)
                .sort((a, b) => a.x - b.x);
              const visibleLabels = pickVisibleLabels(events.map(({ ev, x }) => ({
                id: ev.id, date: ev.date_start, x,
              })));
              return events.map(({ ev, i, x }) => {
                const branchHeight = clamp(EVENT_HEIGHT_PATTERN[i % EVENT_HEIGHT_PATTERN.length]);
                const showLabel = zoomLevel >= 2 && visibleLabels.has(ev.id);
                const isSelected = selectedItem?.type === "event" && selectedItem.data.id === ev.id;
                return (
                  <button
                    key={ev.id}
                    type="button"
                    className={`arc-radiant__branch arc-radiant__branch--event${isSelected ? " is-selected" : ""}`}
                    style={{ left: x, bottom: SPINE_RESERVED_PX, height: branchHeight }}
                    onClick={() => setSelectedItem({ type: "event", data: ev })}
                    onPointerEnter={(e) => setHover({ title: ev.title, x: e.clientX, y: e.clientY })}
                    onPointerMove={(e) => setHover({ title: ev.title, x: e.clientX, y: e.clientY })}
                    onPointerLeave={() => setHover(null)}
                  >
                    <span className="arc-radiant__branch-line" style={{ height: branchHeight - 8 }} />
                    <span className="arc-radiant__branch-dot arc-radiant__branch-dot--event" />
                    {showLabel && <span className="arc-radiant__branch-label">{ev.title}</span>}
                  </button>
                );
              });
            })()}
          </div>
        </div>

      </div>

      {hover && (
        <div
          className="arc-radiant__hover-chip"
          style={{ left: hover.x + 14, top: hover.y + 14 }}
        >
          {hover.title}
        </div>
      )}

      <div className="arc-radiant__bottom">
        {selectedItem ? (
          selectedItem.type === "song" ? (
            <SongDetail song={selectedItem.data} onClose={() => setSelectedItem(null)} />
          ) : selectedItem.type === "release" ? (
            <ReleaseDetail album={selectedItem.data} onClose={() => setSelectedItem(null)} />
          ) : (
            <EventDetail event={selectedItem.data} onClose={() => setSelectedItem(null)} />
          )
        ) : (
          <div className="arc-radiant__bottom-empty">
            Tap any node above to read its story.
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Detail panels ----------

function SongDetail({ song, onClose }: { song: ArcSong; onClose: () => void }) {
  const date = song.release_date ?? song.write_date;
  return (
    <div className="arc-radiant__detail">
      <button className="arc-radiant__detail-close" onClick={onClose} aria-label="Close">×</button>
      <div className="arc-radiant__detail-meta">
        <span className="arc-radiant__detail-kind">Song</span>
        {date && <span>{date}</span>}
        {song.rc_tier && <span className={`arc-radiant__tier arc-radiant__tier--${song.rc_tier}`}>{song.rc_tier}</span>}
        {song.song_state && <span>{song.song_state}</span>}
      </div>
      <h3 className="arc-radiant__detail-title">{song.title}</h3>
      <Link href={`/music/songs/${song.slug}`} className="arc-radiant__detail-cta">
        Open song page →
      </Link>
    </div>
  );
}

function ReleaseDetail({ album, onClose }: { album: ArcRelease; onClose: () => void }) {
  return (
    <div className="arc-radiant__detail">
      <button className="arc-radiant__detail-close" onClick={onClose} aria-label="Close">×</button>
      <div className="arc-radiant__detail-meta">
        <span className="arc-radiant__detail-kind">Album</span>
        {album.release_date && <span>{album.release_date}</span>}
      </div>
      <h3 className="arc-radiant__detail-title">{album.title}</h3>
      <Link href={`/music/releases/${album.slug}`} className="arc-radiant__detail-cta">
        Open album page →
      </Link>
    </div>
  );
}

function EventDetail({ event, onClose }: { event: ArcLifeEvent; onClose: () => void }) {
  return (
    <div className="arc-radiant__detail">
      <button className="arc-radiant__detail-close" onClick={onClose} aria-label="Close">×</button>
      <div className="arc-radiant__detail-meta">
        <span className="arc-radiant__detail-kind">Life Event</span>
        {event.date_start && <span>{event.date_start}</span>}
      </div>
      <h3 className="arc-radiant__detail-title">{event.title}</h3>
      <div className="arc-radiant__detail-body" dangerouslySetInnerHTML={{ __html: event.body_html }} />
    </div>
  );
}

// ---------- Key swatch ----------

function KeySwatch({ layer }: { layer: LayerKey }) {
  // Each swatch mirrors the on-canvas appearance: a strip of tier-colored
  // dots for music, a glowing dot for life events, a colored band for era
  // layers, a curve for compass charge.
  if (layer === "music") {
    return (
      <span className="arc-radiant__swatch-tier-row" aria-hidden="true">
        {TIER_ORDER.map((t) => (
          <span
            key={t}
            className="arc-radiant__swatch-tier-cd"
            style={{ background: TIER_COLORS[t], borderColor: TIER_COLORS[t] }}
          />
        ))}
      </span>
    );
  }
  if (layer === "lifeEvents") {
    return <span className="arc-radiant__swatch-dot arc-radiant__swatch-dot--event" />;
  }
  if (layer === "lifeEras") {
    return <span className="arc-radiant__swatch-band arc-radiant__swatch-band--life" />;
  }
  if (layer === "releaseEras") {
    return <span className="arc-radiant__swatch-band arc-radiant__swatch-band--release" />;
  }
  return (
    <svg className="arc-radiant__swatch-curve" viewBox="0 0 24 12" preserveAspectRatio="none">
      <defs>
        <linearGradient id="key-charge-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%"   stopColor="#aa54ff" />
          <stop offset="50%"  stopColor="#33cc55" />
          <stop offset="100%" stopColor="#ff3333" />
        </linearGradient>
      </defs>
      <path d="M 1 9 Q 5 1, 9 6 T 17 5 T 23 7" stroke="url(#key-charge-gradient)" strokeWidth="1.4" fill="none" />
    </svg>
  );
}

// ---------- Charge path subcomponent ----------

function ChargePath({ data, yearStart, yearSpan }: {
  data: { year: number; charge: number; n: number }[];
  yearStart: number;
  yearSpan: number;
}) {
  // x = position along timeline (0..100), y = charge mapped to height
  // (positive charge rises from spine: charge=+100 → y=10, charge=-100 → y=90).
  const points = data.map((d) => ({
    x: ((d.year - yearStart) / yearSpan) * 100,
    y: 50 - (d.charge / 100) * 40,
  }));
  if (points.length < 2) return null;

  let dPath = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cx = (prev.x + curr.x) / 2;
    const cy = (prev.y + curr.y) / 2;
    dPath += ` Q ${prev.x} ${prev.y}, ${cx} ${cy}`;
  }
  dPath += ` T ${points[points.length - 1].x} ${points[points.length - 1].y}`;

  return (
    <>
      <path d={dPath} stroke="url(#charge-gradient)" strokeWidth={1.2} fill="none" vectorEffect="non-scaling-stroke" />
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
