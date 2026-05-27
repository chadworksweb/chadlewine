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
  // Aggregate Compass charge for the release (mean of its track charges) and
  // the RC tier that charge falls in. Computed server-side. null when no track
  // on the release is calibrated.
  charge: number | null;
  tier: string | null;
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
// sit at the bottom (the "horizon"). Canvas height is FIXED so it's identical
// across viewport sizes — sized to the actual content envelope (max album
// stalk + spine + small top padding) with no viewport-based scaling. Big
// screens stop accumulating empty space above; small screens don't get
// inflated past what their viewport supports.
const CANVAS_HEIGHT = 400;
const SPINE_RESERVED_PX = 40; // bottom strip reserved for year ticks + labels

// Era zone — one lane per kind, stacked just above the spine. Overlap within
// a kind is communicated by the translucent fills blending naturally.
const ERA_ROW_HEIGHT = 33;
const ERA_KIND_GAP = 4;
const ERA_LIFE_ROW_BOTTOM = SPINE_RESERVED_PX + 6;
const ERA_RELEASE_ROW_BOTTOM = ERA_LIFE_ROW_BOTTOM + ERA_ROW_HEIGHT + ERA_KIND_GAP;
// Total era zone reserved height above spine
const ERA_ZONE_TOP = ERA_RELEASE_ROW_BOTTOM + ERA_ROW_HEIGHT;

// Branch zone — dots and labels live here, well above the era zone so the
// layers don't overlap visually. Patterns span this zone with wide variation.
const BRANCH_BOTTOM = ERA_ZONE_TOP + 12;
const BRANCH_TOP_PADDING = 30;

// Heights are written from spine. Branches with `bottom: SPINE_RESERVED_PX`
// rise upward by `branchHeight`. So height = position-of-dot above spine.
// The patterns below land dots well above the era zone. ~25% shorter than the
// previous design so the whole arc fits a laptop viewport without scrolling.
const ALBUM_HEIGHT_PATTERN = [320, 285, 345, 305, 260, 330];
// Life events stack tighter than the albums above them but with enough
// vertical spread (~130 to ~225) that overlapping events don't pile on
// top of each other.
const EVENT_HEIGHT_PATTERN = [135, 195, 160, 220, 145, 205, 175, 225, 140, 200, 180];

// ---------- Component ----------

export function ArcRadiant({ data, proseAvailable = false }: { data: ArcInitialData; proseAvailable?: boolean }) {
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({
    music: true, lifeEvents: true, lifeEras: true, releaseEras: true, compass: true,
  });
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [selectedItem, setSelectedItem] = useState<SelectedItem>(null);
  // Pixel position of the click that opened the modal, relative to the
  // outer .arc-radiant container. Drives both the radial-gradient "hole"
  // that keeps the active node un-dimmed and the SVG line connecting the
  // node to the modal.
  const [selectedPos, setSelectedPos] = useState<{ x: number; y: number } | null>(null);
  const [hover, setHover] = useState<{ title: string; x: number; y: number } | null>(null);

  // Callback-ref + state so the modal can receive the actual element without
  // reading rootRef.current during render (react-hooks/refs).
  const [rootEl, setRootEl] = useState<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  function selectNode(item: SelectedItem, e: React.MouseEvent<HTMLElement>) {
    setSelectedItem(item);
    if (!item) {
      setSelectedPos(null);
      return;
    }
    const root = rootEl;
    const target = e.currentTarget;
    if (!root) {
      setSelectedPos(null);
      return;
    }
    // Anchor to the center of the node icon (CD/dot) rather than the raw
    // click point so the line lands cleanly even when the user clicks the
    // stalk or label region of the branch.
    const dot = target.querySelector(
      ".arc-radiant__cd, .arc-radiant__branch-dot",
    ) as HTMLElement | null;
    const dotRect = (dot ?? target).getBoundingClientRect();
    const rootRect = root.getBoundingClientRect();
    setSelectedPos({
      x: dotRect.left - rootRect.left + dotRect.width / 2,
      y: dotRect.top - rootRect.top + dotRect.height / 2,
    });
  }

  function clearSelection() {
    setSelectedItem(null);
    setSelectedPos(null);
  }
  const [yearStart, yearEnd] = data.yearRange;
  const yearSpan = Math.max(1, yearEnd - yearStart);

  // Canvas height is normally fixed at CANVAS_HEIGHT. In fullscreen we track
  // the canvas element's measured clientHeight so the inner content fills the
  // viewport. Branch heights below scale proportionally so dots use the
  // larger area instead of clustering near the spine.
  const [fullscreenCanvasHeight, setFullscreenCanvasHeight] = useState<number>(CANVAS_HEIGHT);
  const canvasHeight = isFullscreen ? fullscreenCanvasHeight : CANVAS_HEIGHT;

  // Mirror canvas scrollLeft + clientWidth in state so the overview locator can
  // render the viewport box in the same coordinate space the canvas scrolls in.
  // viewportWidth doubles as baseWidth: at zoom 1, totalWidth = viewportWidth,
  // meaning the full timeline spans exactly the visible canvas (Lifetime view
  // = entire locator track filled).
  const [scrollLeft, setScrollLeft] = useState<number>(0);
  const [viewportWidth, setViewportWidth] = useState<number>(1200);
  const baseWidth = viewportWidth;
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    function syncWidth() {
      if (!el) return;
      setViewportWidth(el.clientWidth);
    }
    function syncScroll() {
      if (!el) return;
      setScrollLeft(el.scrollLeft);
    }
    syncWidth();
    syncScroll();
    el.addEventListener("scroll", syncScroll, { passive: true });
    window.addEventListener("resize", syncWidth);
    return () => {
      el.removeEventListener("scroll", syncScroll);
      window.removeEventListener("resize", syncWidth);
    };
  }, []);

  // When the locator drives a zoom + scroll change, we can't set scrollLeft
  // until React re-renders the inner div at its new width — otherwise the new
  // scrollLeft gets clamped by the old maxScroll. Stash the desired scroll on
  // a ref and apply it from an effect that runs after totalWidth updates.
  const pendingScrollRef = useRef<number | null>(null);

  const totalWidth = baseWidth * zoomLevel;
  const pxPerYear = totalWidth / yearSpan;
  const branchTop = canvasHeight - BRANCH_TOP_PADDING;
  function clamp(h: number): number {
    return Math.max(BRANCH_BOTTOM, Math.min(branchTop, h));
  }

  // Linear scale that maps the standard 400px-tall canvas patterns into the
  // current canvas. BRANCH_BOTTOM is fixed (era zone above the spine), so we
  // scale only the headroom above it. Identity (1.0) at default canvasHeight.
  const baseBranchHeadroom = CANVAS_HEIGHT - BRANCH_TOP_PADDING - BRANCH_BOTTOM;
  const currentBranchHeadroom = branchTop - BRANCH_BOTTOM;
  const branchHeightScale = baseBranchHeadroom > 0 ? currentBranchHeadroom / baseBranchHeadroom : 1;
  function scalePattern(p: number): number {
    return BRANCH_BOTTOM + (p - BRANCH_BOTTOM) * branchHeightScale;
  }

  // Pinch state (two-pointer)
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const lastPinchDistRef = useRef<number | null>(null);

  // Compass trajectory mirrors RC's artist trajectory: one point per dated,
  // charged RELEASE (not per song), connected chronologically.
  const chargeTrajectory = useMemo(
    () => buildReleaseTrajectory(data.albums, yearStart, yearEnd),
    [data.albums, yearStart, yearEnd]
  );

  // Pre-sort eras by kind + date, fill in missing date_end values from the
  // NEXT same-kind era's date_start (or today if last). Most release eras come
  // from the discography ingest with no explicit "Era: Month - Month" window,
  // so date_end arrives null. Without chaining, every dateless era would
  // stretch from its start all the way to today. Each kind sits in a single
  // lane — overlapping eras blend through their translucent fills rather than
  // splitting into sub-rows.
  const stackedEras = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    function chain(eras: ArcEra[]) {
      const sorted = [...eras].sort((a, b) => a.date_start.localeCompare(b.date_start));
      return sorted.map((era, i) => {
        const nextStart = sorted[i + 1]?.date_start ?? today;
        const effectiveEnd = era.date_end && era.date_end < nextStart ? era.date_end : nextStart;
        return { era, effectiveEnd };
      });
    }
    return [
      ...chain(data.eras.filter((e) => e.kind === "life")),
      ...chain(data.eras.filter((e) => e.kind === "release")),
    ];
  }, [data.eras]);

  // Max zoom = visible span of 1 year. visibleSpan = yearSpan / zoom, so
  // zoom <= yearSpan keeps the visible window at >= 1 year wide.
  const zoomMax = Math.max(ZOOM_MIN, yearSpan);
  function applyZoomDelta(factor: number) {
    setZoomLevel((current) => Math.max(ZOOM_MIN, Math.min(zoomMax, current * factor)));
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

  // Measure canvas clientHeight while fullscreen so the inner content fills
  // the viewport (minus toolbar). Falls back to the fixed CANVAS_HEIGHT when
  // not fullscreen so the page renders at its compact, site-width size.
  useEffect(() => {
    if (!isFullscreen) {
      setFullscreenCanvasHeight(CANVAS_HEIGHT);
      return;
    }
    const el = canvasRef.current;
    if (!el) return;
    const update = () => {
      const h = el.clientHeight;
      if (h > 0) setFullscreenCanvasHeight(h);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isFullscreen]);

  // Body scroll lock + ESC-to-exit while fullscreen.
  useEffect(() => {
    if (!isFullscreen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.classList.add("arc-radiant-fullscreen-active");
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setIsFullscreen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.classList.remove("arc-radiant-fullscreen-active");
      window.removeEventListener("keydown", onKey);
    };
  }, [isFullscreen]);

  // Optional browser Fullscreen API sync. Best-effort: if the request fails
  // (permissions, unsupported), the app-level fullscreen still works. Listen
  // for fullscreenchange so user-initiated F11/ESC stays in sync with state.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = rootEl;
    if (!root) return;
    if (isFullscreen) {
      if (document.fullscreenElement !== root && root.requestFullscreen) {
        root.requestFullscreen().catch(() => {});
      }
    } else if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
  }, [isFullscreen, rootEl]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    function onFsChange() {
      const active = document.fullscreenElement === rootEl;
      setIsFullscreen((prev) => (prev !== active ? active : prev));
    }
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, [rootEl]);

  // Apply pending scrollLeft after the inner div has re-rendered at the new
  // totalWidth, so locator-driven zoom changes don't get clamped by the old
  // maxScroll bound. setScrollLeft mirrors the new value back into state.
  useEffect(() => {
    const pending = pendingScrollRef.current;
    if (pending == null) return;
    const el = canvasRef.current;
    if (!el) return;
    const maxScroll = Math.max(0, totalWidth - el.clientWidth);
    const next = Math.max(0, Math.min(maxScroll, pending));
    el.scrollLeft = next;
    setScrollLeft(next);
    pendingScrollRef.current = null;
  }, [totalWidth]);

  // Click-an-era-to-frame: animate zoom + pan so the era spans the viewport
  // with a little padding each side. Reuses pendingScrollRef so each frame's
  // scroll is applied AFTER React commits the new width (no maxScroll clamp
  // race). Anchors the era's start at the same pad offset across the zoom so it
  // reads as zooming into the era rather than sliding.
  const focusAnimRef = useRef<number | null>(null);
  useEffect(() => () => { if (focusAnimRef.current) cancelAnimationFrame(focusAnimRef.current); }, []);

  function focusEra(startDate: string, endDate: string) {
    const el = canvasRef.current;
    if (!el) return;
    const startYf = dateToYearFloat(startDate);
    const endYf = dateToYearFloat(endDate);
    const eraSpan = Math.max(0.08, endYf - startYf); // years; floor avoids div-by-0
    const PAD = 0.08; // viewport fraction of breathing room on each side

    let zT = (yearSpan * (1 - 2 * PAD)) / eraSpan;
    zT = Math.max(ZOOM_MIN, Math.min(zoomMax, zT));
    const z0 = zoomLevel;

    // Scroll that puts the era's start PAD in from the left at zoom z.
    const scrollForZoom = (z: number) =>
      (startYf - yearStart) * ((baseWidth * z) / yearSpan) - PAD * viewportWidth;

    if (focusAnimRef.current) cancelAnimationFrame(focusAnimRef.current);

    // Already at target zoom (era re-clicked) — just pan; the totalWidth effect
    // won't fire, so set scrollLeft directly.
    if (Math.abs(zT - z0) < 1e-4) {
      const maxScroll = Math.max(0, totalWidth - el.clientWidth);
      const next = Math.max(0, Math.min(maxScroll, scrollForZoom(zT)));
      el.scrollLeft = next;
      setScrollLeft(next);
      return;
    }

    const dur = 340;
    const t0 = performance.now();
    const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / dur);
      const z = z0 + (zT - z0) * ease(t);
      pendingScrollRef.current = scrollForZoom(z);
      setZoomLevel(z);
      focusAnimRef.current = t < 1 ? requestAnimationFrame(step) : null;
    };
    focusAnimRef.current = requestAnimationFrame(step);
  }

  // Live mirrors so the (once-bound, non-passive) wheel listener always reads
  // current zoom without re-binding every render.
  const zoomLevelRef = useRef(zoomLevel);
  zoomLevelRef.current = zoomLevel;
  const zoomMaxRef = useRef(zoomMax);
  zoomMaxRef.current = zoomMax;

  // Ctrl/Cmd + scroll = cursor-anchored zoom when the pointer is over the arc
  // viewport (trackpad pinch also arrives here with ctrlKey set). Plain scroll
  // is left untouched. Non-passive so we can preventDefault the browser's own
  // page zoom and use pendingScrollRef to keep the date under the cursor fixed.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      if (!e.ctrlKey && !e.metaKey) return;
      if (!el) return;
      e.preventDefault();
      const vw = el.clientWidth;
      const z0 = zoomLevelRef.current;
      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 16;        // lines -> px
      else if (e.deltaMode === 2) dy *= vw;   // pages -> viewport
      const z1 = Math.max(ZOOM_MIN, Math.min(zoomMaxRef.current, z0 * Math.exp(-dy * 0.0015)));
      if (Math.abs(z1 - z0) < 1e-6) return;
      if (focusAnimRef.current) {
        cancelAnimationFrame(focusAnimRef.current);
        focusAnimRef.current = null;
      }
      const cursorX = e.clientX - el.getBoundingClientRect().left;
      const total0 = vw * z0;
      const frac = total0 > 0 ? (el.scrollLeft + cursorX) / total0 : 0;
      pendingScrollRef.current = frac * (vw * z1) - cursorX;
      setZoomLevel(z1);
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <div className={`arc-radiant${isFullscreen ? " arc-radiant--fullscreen" : ""}`} ref={setRootEl}>
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

        <div className="arc-radiant__main">
        <div className="arc-radiant__toolbar">
          <span className="arc-radiant__zoom-label">{zoomLabel(zoomLevel)}</span>
          <ArcOverviewLocator
            yearStart={yearStart}
            yearEnd={yearEnd}
            scrollLeft={scrollLeft}
            totalWidth={totalWidth}
            viewportWidth={viewportWidth}
            baseWidth={baseWidth}
            onChange={(nextZoom, nextScroll) => {
              const z = Math.max(ZOOM_MIN, Math.min(zoomMax, nextZoom));
              const el = canvasRef.current;
              if (Math.abs(z - zoomLevel) < 1e-6) {
                if (el) {
                  const maxScroll = Math.max(0, totalWidth - el.clientWidth);
                  el.scrollLeft = Math.max(0, Math.min(maxScroll, nextScroll));
                }
                return;
              }
              pendingScrollRef.current = nextScroll;
              setZoomLevel(z);
            }}
          />
          <div className="arc-radiant__toolbar-right">
            {proseAvailable && (
              <Link href="/radiant-arc?view=prose" className="arc-radiant__view-switch">
                Switch to Prose →
              </Link>
            )}
            <button
              type="button"
              className="arc-radiant__fullscreen-btn"
              onClick={() => setIsFullscreen((v) => !v)}
              aria-pressed={isFullscreen}
              aria-label={isFullscreen ? "Exit fullscreen (Esc)" : "Enter fullscreen"}
              title={isFullscreen ? "Exit fullscreen (Esc)" : "Enter fullscreen"}
            >
              {isFullscreen ? (
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                  <path
                    d="M6 1v4H2M10 1v4h4M6 15v-4H2M10 15v-4h4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                  <path
                    d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
              <span className="arc-radiant__fullscreen-label">
                {isFullscreen ? "Exit" : "Fullscreen"}
              </span>
            </button>
          </div>
        </div>
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
                // yearStart is always labeled (so 1989 anchors the timeline).
                // Suppress the immediate next year (e.g. 1990) at low zoom so
                // the two labels don't collide.
                const showLabel =
                  year === yearStart ||
                  (year !== yearStart + 1 && (zoomLevel >= 5 || year % 5 === 0));
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

            {/* Eras: horizontal segments. Life eras share one lane in the
                lower band, release eras share one in the upper. Overlap is
                communicated by the translucent fills blending naturally. */}
            {stackedEras.map(({ era, effectiveEnd }) => {
              if (era.kind === "life" && !layers.lifeEras) return null;
              if (era.kind === "release" && !layers.releaseEras) return null;
              const x1 = dateToX(era.date_start);
              const x2 = dateToX(effectiveEnd);
              if (x1 == null || x2 == null) return null;
              const width = Math.max(8, x2 - x1);
              const minLabelWidth = zoomLevel >= 5 ? 60 : zoomLevel >= 2 ? 120 : 180;
              const showLabel = width >= minLabelWidth;
              const bottomOffset = era.kind === "life" ? ERA_LIFE_ROW_BOTTOM : ERA_RELEASE_ROW_BOTTOM;
              return (
                <div
                  key={era.id}
                  className={`arc-radiant__era arc-radiant__era--${era.kind}`}
                  style={{ left: x1, width, bottom: bottomOffset, height: ERA_ROW_HEIGHT }}
                  role="button"
                  tabIndex={0}
                  title={`Zoom to ${era.title}`}
                  aria-label={`Zoom to era: ${era.title}`}
                  onClick={() => focusEra(era.date_start, effectiveEnd)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      focusEra(era.date_start, effectiveEnd);
                    }
                  }}
                >
                  {showLabel && (
                    <span className="arc-radiant__era-label">{era.title}</span>
                  )}
                </div>
              );
            })}

            {/* Compass charge — horizontal SVG ribbon bounded to the band ABOVE
                the era lanes (bottom = ERA_ZONE_TOP), so the full charge range
                (+100 at y=10 .. -100 at y=90) maps into that region and the area
                wash never bleeds over the life/release era lanes below. */}
            {layers.compass && chargeTrajectory.length > 1 && (
              <svg
                className="arc-radiant__layer arc-radiant__layer--compass"
                preserveAspectRatio="none"
                viewBox="0 0 100 100"
                style={{
                  width: totalWidth,
                  height: branchTop - ERA_ZONE_TOP,
                  bottom: ERA_ZONE_TOP,
                }}
              >
                <defs>
                  {/* Tier gradient copied from RC's traj-grad. userSpaceOnUse +
                      fixed y (charge +100 at y=10, -100 at y=90) so the color
                      reflects ABSOLUTE charge, not the curve's local extent. */}
                  <linearGradient id="charge-gradient" gradientUnits="userSpaceOnUse" x1="0" y1="10" x2="0" y2="90">
                    <stop offset="0%"   stopColor="#aa54ff" />
                    <stop offset="25%"  stopColor="#3388ff" />
                    <stop offset="50%"  stopColor="#33cc55" />
                    <stop offset="75%"  stopColor="#ffbb33" />
                    <stop offset="100%" stopColor="#ff3333" />
                  </linearGradient>
                  {/* Area fill under the line — RC's traj-area-grad: low-opacity
                      tier wash that fades through near-transparent at neutral. */}
                  <linearGradient id="charge-area-gradient" gradientUnits="userSpaceOnUse" x1="0" y1="10" x2="0" y2="90">
                    <stop offset="0%"   stopColor="#aa54ff" stopOpacity="0.2" />
                    <stop offset="50%"  stopColor="#33cc55" stopOpacity="0.05" />
                    <stop offset="100%" stopColor="#ff3333" stopOpacity="0.2" />
                  </linearGradient>
                </defs>
                <ChargePath data={chargeTrajectory} yearStart={yearStart} yearSpan={yearSpan} />
              </svg>
            )}

            {/* Compass hover points — invisible hit targets at each release's
                charge vertex on the trajectory. The drawn line stays clean; on
                hover a small tier-colored dot surfaces (RC's hover-dot) plus the
                shared hover chip, and clicking opens the same release detail. */}
            {layers.compass && (() => {
              const compassH = branchTop - ERA_ZONE_TOP;
              return data.albums
                .filter((a) => a.release_date != null && a.charge != null)
                .map((a) => {
                  const x = dateToX(a.release_date);
                  if (x == null) return null;
                  // Mirror ChargePath: y_vb = 50 - charge/100*40, so the vertex's
                  // height above the band bottom is (0.5 + 0.4*charge/100).
                  const pointBottom = ERA_ZONE_TOP + (0.5 + 0.4 * (a.charge! / 100)) * compassH;
                  const isSelected = selectedItem?.type === "release" && selectedItem.data.id === a.id;
                  return (
                    <button
                      key={`cp-${a.id}`}
                      type="button"
                      className={`arc-radiant__charge-point${isSelected ? " is-selected" : ""}`}
                      style={{ left: x, bottom: pointBottom, ["--pt-color" as string]: TIER_COLORS[a.tier ?? "green"] }}
                      onClick={(e) => selectNode({ type: "release", data: a }, e)}
                      onPointerEnter={(e) => setHover({ title: a.title, x: e.clientX, y: e.clientY })}
                      onPointerMove={(e) => setHover({ title: a.title, x: e.clientX, y: e.clientY })}
                      onPointerLeave={() => setHover(null)}
                      aria-label={a.title}
                    />
                  );
                });
            })()}

            {/* Albums — same CD icon as singles (slightly larger), placed at
                the album's release_date. No on-canvas labels; title surfaces
                via hover chip and the bottom detail panel. */}
            {layers.music && (() => {
              const items = data.albums
                .map((a, i) => ({ a, i, x: dateToX(a.release_date) }))
                .filter((e): e is { a: ArcRelease; i: number; x: number } => e.x != null)
                .sort((a, b) => a.x - b.x);
              return items.map(({ a, i, x }) => {
                const branchHeight = clamp(scalePattern(ALBUM_HEIGHT_PATTERN[i % ALBUM_HEIGHT_PATTERN.length]));
                const isSelected = selectedItem?.type === "release" && selectedItem.data.id === a.id;
                return (
                  <button
                    key={a.id}
                    type="button"
                    className={`arc-radiant__branch arc-radiant__branch--album${isSelected ? " is-selected" : ""}`}
                    style={{ left: x, bottom: SPINE_RESERVED_PX, height: branchHeight }}
                    onClick={(e) => selectNode({ type: "release", data: a }, e)}
                    onPointerEnter={(e) => setHover({ title: a.title, x: e.clientX, y: e.clientY })}
                    onPointerMove={(e) => setHover({ title: a.title, x: e.clientX, y: e.clientY })}
                    onPointerLeave={() => setHover(null)}
                  >
                    <span className="arc-radiant__branch-line" style={{ height: branchHeight - 12 }} />
                    <span className="arc-radiant__cd arc-radiant__cd--album" />
                  </button>
                );
              });
            })()}

            {/* Life events — vertical branches rising from spine; titles
                surface via hover chip + detail panel.

                Collision handling (render-only, never mutates stored dates):
                events sharing the exact same date_start — chiefly the
                documentary placeholders all pinned to Jan-1 of their year — are
                fanned FORWARD across the year so each stays reachable. The fan
                width tracks zoom (tight when zoomed out, spreading to most of a
                year's width when there's room), and heights vary so the dots
                scatter in 2D. Distinct real dates form groups of one => zero
                offset, so this self-dissolves as real dates get added. */}
            {layers.lifeEvents && (() => {
              const placed = data.lifeEvents
                .map((ev) => ({ ev, x: dateToX(ev.date_start) }))
                .filter((e): e is { ev: ArcLifeEvent; x: number } => e.x != null);

              const groups = new Map<string, { ev: ArcLifeEvent; x: number }[]>();
              for (const e of placed) {
                const key = e.ev.date_start ?? `_${e.x}`;
                const arr = groups.get(key) ?? [];
                arr.push(e);
                groups.set(key, arr);
              }

              const nodes: React.ReactNode[] = [];
              let hi = 0; // running index so fanned heights stay varied
              for (const members of groups.values()) {
                const n = members.length;
                // Fan stays within one year (placeholders are Jan-1, so spreading
                // forward never implies a prior-year date) and adapts to zoom.
                const spread = n > 1 ? Math.min(pxPerYear * 0.92, (n - 1) * 14) : 0;
                members
                  .slice()
                  .sort((a, b) => a.ev.title.localeCompare(b.ev.title))
                  .forEach(({ ev, x }, k) => {
                    const fx = x + (n > 1 ? (k * spread) / (n - 1) : 0);
                    const branchHeight = clamp(scalePattern(EVENT_HEIGHT_PATTERN[(hi + k) % EVENT_HEIGHT_PATTERN.length]));
                    const isSelected = selectedItem?.type === "event" && selectedItem.data.id === ev.id;
                    nodes.push(
                      <button
                        key={ev.id}
                        type="button"
                        className={`arc-radiant__branch arc-radiant__branch--event${isSelected ? " is-selected" : ""}`}
                        style={{ left: fx, bottom: SPINE_RESERVED_PX, height: branchHeight }}
                        onClick={(e) => selectNode({ type: "event", data: ev }, e)}
                        onPointerEnter={(e) => setHover({ title: ev.title, x: e.clientX, y: e.clientY })}
                        onPointerMove={(e) => setHover({ title: ev.title, x: e.clientX, y: e.clientY })}
                        onPointerLeave={() => setHover(null)}
                      >
                        <span className="arc-radiant__branch-line" style={{ height: branchHeight - 8 }} />
                        <span className="arc-radiant__branch-dot arc-radiant__branch-dot--event" />
                      </button>,
                    );
                  });
                hi += n;
              }
              return nodes;
            })()}
          </div>
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

      {selectedItem && selectedPos && (
        <ArcRadiantModal
          item={selectedItem}
          nodePos={selectedPos}
          rootEl={rootEl}
          onClose={clearSelection}
        />
      )}
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
  data: ReleasePoint[];
  yearStart: number;
  yearSpan: number;
}) {
  // x = position along timeline (0..100) at the exact release date, y = charge
  // mapped to height (charge=+100 → y=10, 0 → y=50, -100 → y=90). One release
  // per vertex. Straight segments + area fill + grid, copied from RC's
  // renderTrajectoryChart — no bezier smoothing, no per-point dots.
  const points = data.map((d) => ({
    x: ((dateToYearFloat(d.date) - yearStart) / yearSpan) * 100,
    y: 50 - (d.charge / 100) * 40,
  }));
  if (points.length < 2) return null;

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ");
  // Area drops from the line to the horizon (bottom of the band) and back.
  const first = points[0];
  const last = points[points.length - 1];
  const areaPath = `${linePath} L ${last.x.toFixed(2)} 100 L ${first.x.toFixed(2)} 100 Z`;

  // Charge reference lines: +100 / +50 / 0 / -50 / -100.
  const gridLines = [10, 30, 50, 70, 90];

  return (
    <>
      {gridLines.map((y) => (
        <line
          key={y}
          className="arc-radiant__charge-grid"
          x1={first.x}
          y1={y}
          x2={last.x}
          y2={y}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      <path className="arc-radiant__charge-area" d={areaPath} fill="url(#charge-area-gradient)" />
      <path
        className="arc-radiant__charge-line"
        d={linePath}
        stroke="url(#charge-gradient)"
        vectorEffect="non-scaling-stroke"
      />
    </>
  );
}

// ---------- Overview locator (Ableton-style mini-trajectory) ----------

type LocatorDrag = {
  handle: "pan" | "left" | "right";
  startClientX: number;
  startClientY: number;
  startVisibleStart: number;
  startVisibleEnd: number;
  overviewWidth: number;
};

function ArcOverviewLocator({
  yearStart,
  yearEnd,
  scrollLeft,
  totalWidth,
  viewportWidth,
  baseWidth,
  onChange,
}: {
  yearStart: number;
  yearEnd: number;
  scrollLeft: number;
  totalWidth: number;
  viewportWidth: number;
  baseWidth: number;
  onChange: (zoomLevel: number, scrollLeft: number) => void;
}) {
  const yearSpan = Math.max(1, yearEnd - yearStart);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<LocatorDrag | null>(null);
  const [isActive, setIsActive] = useState(false);

  // Map canvas scroll/zoom → visible year window.
  const safeTotal = Math.max(1, totalWidth);
  const visibleStartYear = yearStart + (scrollLeft / safeTotal) * yearSpan;
  const visibleEndYear = visibleStartYear + (viewportWidth / safeTotal) * yearSpan;

  const leftPct = ((visibleStartYear - yearStart) / yearSpan) * 100;
  const widthPct = Math.max(1.5, ((visibleEndYear - visibleStartYear) / yearSpan) * 100);

  // Label format: when the visible span is wide we just show years (floor/ceil
  // so the two labels never collapse to the same value). When zoomed in tight
  // (under 5 years visible), add the month so the labels stay distinguishable.
  function formatYear(yearFloat: number, mode: "start" | "end", withMonth: boolean): string {
    const baseYear = mode === "start" ? Math.floor(yearFloat) : Math.ceil(yearFloat);
    if (!withMonth) return String(baseYear);
    const frac = yearFloat - Math.floor(yearFloat);
    const monthIdx = Math.max(0, Math.min(11, Math.floor(frac * 12)));
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${months[monthIdx]} ${Math.floor(yearFloat)}`;
  }
  const span = visibleEndYear - visibleStartYear;
  const withMonth = span < 5;
  const startLabel = formatYear(visibleStartYear, "start", withMonth);
  const endLabel = formatYear(visibleEndYear, "end", withMonth);

  // Convert visible-year window → (zoomLevel, scrollLeft) and dispatch.
  // Minimum visible span is 1 year (max zoom level).
  const MIN_SPAN_YEARS = 1;
  function applyWindow(visStart: number, visEnd: number) {
    const s = Math.max(yearStart, Math.min(yearEnd - MIN_SPAN_YEARS, visStart));
    const e = Math.max(s + MIN_SPAN_YEARS, Math.min(yearEnd, visEnd));
    const visSpan = Math.max(MIN_SPAN_YEARS, e - s);
    // pxPerYear inside the visible window stays equal to clientWidth/visSpan,
    // so totalWidth = pxPerYear * yearSpan = (clientWidth * yearSpan) / visSpan.
    const safeVp = Math.max(1, viewportWidth);
    const nextTotal = (safeVp * yearSpan) / visSpan;
    const nextZoom = nextTotal / Math.max(1, baseWidth);
    const nextScroll = ((s - yearStart) / yearSpan) * nextTotal;
    onChange(nextZoom, nextScroll);
  }

  // Live refs of the props the drag handlers read on every pointermove —
  // closures inside useEffect would otherwise see stale values after the
  // parent re-renders mid-drag. Sync in an effect so refs aren't mutated
  // during render (react-hooks/refs).
  const applyWindowRef = useRef<(s: number, e: number) => void>(() => {});
  const yearStartRef = useRef(yearStart);
  const yearEndRef = useRef(yearEnd);
  const yearSpanRef = useRef(yearSpan);
  useEffect(() => {
    applyWindowRef.current = applyWindow;
    yearStartRef.current = yearStart;
    yearEndRef.current = yearEnd;
    yearSpanRef.current = yearSpan;
  });

  function startDrag(
    handle: LocatorDrag["handle"],
    clientX: number,
    clientY: number,
    pointerId: number,
  ) {
    const track = trackRef.current;
    if (!track) return;
    dragRef.current = {
      handle,
      startClientX: clientX,
      startClientY: clientY,
      startVisibleStart: visibleStartYear,
      startVisibleEnd: visibleEndYear,
      overviewWidth: track.getBoundingClientRect().width || 1,
    };
    setIsActive(true);
    // Capture so subsequent pointer moves keep firing on the track even
    // when the cursor leaves the track's bounding box.
    try {
      track.setPointerCapture(pointerId);
    } catch {
      // ignore: some pointer types don't support capture
    }
  }

  // Listeners stay registered for the component lifetime; the closures read
  // from refs above so they always see the latest values without depending
  // on React state directly. Listeners are on the track so setPointerCapture
  // routes events here even when the cursor leaves the visible track.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    function onMove(e: PointerEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      const pxPerYear = drag.overviewWidth / yearSpanRef.current;
      const yearDelta = (e.clientX - drag.startClientX) / pxPerYear;

      let ns = drag.startVisibleStart;
      let ne = drag.startVisibleEnd;

      if (drag.handle === "pan") {
        // Horizontal: pan the window. Vertical: scale the window's span
        // around its center (Ableton-style overview drag — down to zoom in,
        // up to zoom out). Negative sign flips the natural exp so a positive
        // yPxDelta (downward drag) shrinks the span.
        const yPxDelta = e.clientY - drag.startClientY;
        const scale = Math.exp(-yPxDelta / 200);
        const baseSpan = drag.startVisibleEnd - drag.startVisibleStart;
        const scaledSpan = Math.max(
          MIN_SPAN_YEARS,
          Math.min(yearEndRef.current - yearStartRef.current, baseSpan * scale),
        );
        const baseCenter = (drag.startVisibleStart + drag.startVisibleEnd) / 2;
        const center = baseCenter + yearDelta;
        ns = center - scaledSpan / 2;
        ne = center + scaledSpan / 2;
        if (ns < yearStartRef.current) {
          ns = yearStartRef.current;
          ne = ns + scaledSpan;
        }
        if (ne > yearEndRef.current) {
          ne = yearEndRef.current;
          ns = ne - scaledSpan;
        }
      } else if (drag.handle === "left") {
        ns = Math.max(
          yearStartRef.current,
          Math.min(ne - MIN_SPAN_YEARS, drag.startVisibleStart + yearDelta),
        );
      } else if (drag.handle === "right") {
        ne = Math.min(
          yearEndRef.current,
          Math.max(ns + MIN_SPAN_YEARS, drag.startVisibleEnd + yearDelta),
        );
      }

      applyWindowRef.current(ns, ne);
    }
    function onUp(e: PointerEvent) {
      if (!dragRef.current) return;
      dragRef.current = null;
      setIsActive(false);
      try {
        track?.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
    track.addEventListener("pointermove", onMove);
    track.addEventListener("pointerup", onUp);
    track.addEventListener("pointercancel", onUp);
    return () => {
      track.removeEventListener("pointermove", onMove);
      track.removeEventListener("pointerup", onUp);
      track.removeEventListener("pointercancel", onUp);
    };
  }, []);

  function onTrackPointerDown(e: React.PointerEvent) {
    if (e.button !== undefined && e.button !== 0) return;
    const target = (e.target as HTMLElement).closest("[data-handle]") as HTMLElement | null;
    if (target?.dataset.handle) {
      startDrag(
        target.dataset.handle as LocatorDrag["handle"],
        e.clientX,
        e.clientY,
        e.pointerId,
      );
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    // Empty area click: jump viewport center to click position, keep span.
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetCenter = yearStart + pct * yearSpan;
    const span = visibleEndYear - visibleStartYear;
    let ns = targetCenter - span / 2;
    let ne = ns + span;
    if (ns < yearStart) {
      ns = yearStart;
      ne = ns + span;
    }
    if (ne > yearEnd) {
      ne = yearEnd;
      ns = ne - span;
    }
    applyWindow(ns, ne);
  }

  return (
    <div
      ref={trackRef}
      className={`arc-radiant__overview${isActive ? " is-active" : ""}`}
      role="slider"
      aria-label="Year-range locator: drag the box to pan, drag the edges to zoom"
      aria-valuemin={yearStart}
      aria-valuemax={yearEnd}
      aria-valuenow={Math.round(visibleStartYear)}
      tabIndex={-1}
      onPointerDown={onTrackPointerDown}
    >
      <div
        className="arc-radiant__overview-viewport"
        data-handle="pan"
        style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
      >
        <span className="arc-radiant__overview-year arc-radiant__overview-year--left">
          {startLabel}
        </span>
        <span className="arc-radiant__overview-year arc-radiant__overview-year--right">
          {endLabel}
        </span>
        <div
          className="arc-radiant__overview-handle arc-radiant__overview-handle--left"
          data-handle="left"
          aria-label="Drag to set start year"
        />
        <div
          className="arc-radiant__overview-handle arc-radiant__overview-handle--right"
          data-handle="right"
          aria-label="Drag to set end year"
        />
        <div className="arc-radiant__overview-grip" aria-hidden="true" />
      </div>
    </div>
  );
}

// ---------- Modal popover ----------
//
// Sits on top of the entire .arc-radiant area when a node is clicked. The
// backdrop's background is a radial gradient with a transparent "hole"
// centered on the clicked node — that keeps the active node bright while
// everything else dims. An SVG line connects the node to the floating
// detail panel.

function ArcRadiantModal({
  item,
  nodePos,
  rootEl,
  onClose,
}: {
  item: NonNullable<SelectedItem>;
  nodePos: { x: number; y: number };
  rootEl: HTMLElement | null;
  onClose: () => void;
}) {
  const modalRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>(() => ({
    w: rootEl?.clientWidth ?? 1200,
    h: rootEl?.clientHeight ?? 600,
  }));
  const [modalRect, setModalRect] = useState<{ x: number; y: number } | null>(null);

  // Track the root's size so the line and gradient stay aligned through
  // resizes / orientation changes while the modal is open.
  useEffect(() => {
    if (!rootEl) return;
    const update = () => setSize({ w: rootEl.clientWidth, h: rootEl.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(rootEl);
    return () => ro.disconnect();
  }, [rootEl]);

  // After layout, measure the modal so the line lands at its edge, not at
  // the geometric center of the container.
  useEffect(() => {
    const m = modalRef.current;
    const root = rootEl;
    if (!m || !root) return;
    const update = () => {
      const mr = m.getBoundingClientRect();
      const rr = root.getBoundingClientRect();
      setModalRect({
        x: mr.left - rr.left + mr.width / 2,
        y: mr.top - rr.top + mr.height / 2,
      });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(m);
    return () => ro.disconnect();
  }, [rootEl]);

  const HOLE_R = 14; // radius of the "spotlight" around the active node
  const FADE_R = HOLE_R + 14;
  const dimColor = "rgba(5, 4, 2, 0.78)";
  const background = `radial-gradient(circle at ${nodePos.x}px ${nodePos.y}px, transparent 0, transparent ${HOLE_R}px, ${dimColor} ${FADE_R}px, ${dimColor} 100%)`;

  return (
    <div
      className="arc-radiant__modal-backdrop"
      style={{ background }}
      onClick={onClose}
      role="presentation"
    >
      {modalRect && (
        <svg
          className="arc-radiant__modal-line"
          width={size.w}
          height={size.h}
          aria-hidden="true"
        >
          <line
            x1={nodePos.x}
            y1={nodePos.y}
            x2={modalRect.x}
            y2={modalRect.y}
            stroke="rgba(247, 200, 74, 0.65)"
            strokeWidth={1.2}
            strokeDasharray="4 4"
          />
        </svg>
      )}
      <div
        ref={modalRef}
        className="arc-radiant__modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {item.type === "song" ? (
          <SongDetail song={item.data} onClose={onClose} />
        ) : item.type === "release" ? (
          <ReleaseDetail album={item.data} onClose={onClose} />
        ) : (
          <EventDetail event={item.data} onClose={onClose} />
        )}
      </div>
    </div>
  );
}

// ---------- Aggregation ----------

type ReleasePoint = { date: string; charge: number; tier: string; title: string; id: string };

// Fractional year for a YYYY-MM-DD date, matching dateToX's mapping so compass
// points line up horizontally with the release CDs.
function dateToYearFloat(d: string): number {
  const [y, m = "1", day = "1"] = d.split("-");
  return parseInt(y, 10) + (parseInt(m, 10) - 1) / 12 + (parseInt(day, 10) - 1) / 365;
}

// One trajectory point per dated, charged release, sorted chronologically.
// Releases with no release_date are off the timeline; releases with no charged
// track have no point. Mirrors RC's /artists/{slug}/trajectory.
function buildReleaseTrajectory(releases: ArcRelease[], yearStart: number, yearEnd: number): ReleasePoint[] {
  return releases
    .filter((r): r is ArcRelease & { release_date: string; charge: number; tier: string } =>
      r.release_date != null && r.charge != null && r.tier != null)
    .filter((r) => {
      const year = parseInt(r.release_date.slice(0, 4), 10);
      return year >= yearStart && year <= yearEnd;
    })
    .map((r) => ({ date: r.release_date, charge: r.charge, tier: r.tier, title: r.title, id: r.id }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
