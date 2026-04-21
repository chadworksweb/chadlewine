"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";

interface AlbumCubeRadiantProps {
  title: string;
  href: string;
  coverArtPath: string | null;
  planeThreeVideo?: string | null;
  chorus?: string | null;
}

const MAX_ANGLE = 90;
const DEADZONE = 0.125;
const SATURATION = 0.90;
const DAMPING = 0.12;

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

function extractScale(transform: string): number {
  if (!transform || transform === "none") return 1;
  const match = transform.match(/matrix(3d)?\(([^)]+)\)/);
  if (!match) return 1;
  const parts = match[2].split(",").map((v) => parseFloat(v.trim()));
  if (parts.length === 16) {
    return Math.hypot(parts[0], parts[1], parts[2]);
  }
  if (parts.length === 6) {
    return Math.hypot(parts[0], parts[1]);
  }
  return 1;
}

function axisResponse(abs: number) {
  if (abs <= DEADZONE) return 0;
  if (abs >= SATURATION) return 1;
  const t = (abs - DEADZONE) / (SATURATION - DEADZONE);
  return t * t * (3 - 2 * t);
}

export function AlbumCubeRadiant({ title, href, coverArtPath, planeThreeVideo, chorus }: AlbumCubeRadiantProps) {
  const [active, setActive] = useState(false);
  const [overCta, setOverCta] = useState(false);
  const [overFront, setOverFront] = useState(false);
  const [loading, setLoading] = useState(false);
  const frozenRef = useRef(false);
  const loadingTimerRef = useRef<number | null>(null);
  const [debug, setDebug] = useState<null | {
    rotX: number; rotY: number;
    flatW: number; flatH: number;
    boxW: number; boxH: number;
    stageW: number; stageH: number;
    boxScale: number;
    flatScale: number;
    boxTransform: string;
    flatTransform: string;
  }>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const flatRef = useRef<HTMLAnchorElement>(null);
  const frameRef = useRef<number | null>(null);
  const targetRef = useRef({ x: 0, y: 0 });
  const currentRef = useRef({ x: 0, y: 0 });
  const debugEnabledRef = useRef(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      debugEnabledRef.current = new URLSearchParams(window.location.search).has("cubedebug");
    }
  }, []);

  // Measure the box's width and expose half of it as --cube-half-z for face
  // translateZ values. useLayoutEffect runs before paint so the var is set
  // before the first render that reads it, eliminating the cqw fallback frame.
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const apply = () => {
      const w = el.offsetWidth;
      if (w > 0) el.style.setProperty("--cube-half-z", `${w / 2}px`);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!debugEnabledRef.current || !active) return;
    let raf = 0;
    const measure = () => {
      const flatEl = flatRef.current;
      const boxEl = boxRef.current;
      const stageEl = stageRef.current;
      if (!flatEl || !boxEl || !stageEl) {
        raf = requestAnimationFrame(measure);
        return;
      }
      const flat = flatEl.getBoundingClientRect();
      const box = boxEl.getBoundingClientRect();
      const stage = stageEl.getBoundingClientRect();
      const boxTransform = getComputedStyle(boxEl).transform;
      const flatTransform = getComputedStyle(flatEl).transform;
      setDebug({
        rotX: currentRef.current.x, rotY: currentRef.current.y,
        flatW: flat.width, flatH: flat.height,
        boxW: box.width, boxH: box.height,
        stageW: stage.width, stageH: stage.height,
        boxScale: extractScale(boxTransform),
        flatScale: extractScale(flatTransform),
        boxTransform,
        flatTransform,
      });
      raf = requestAnimationFrame(measure);
    };
    raf = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  const tick = useCallback(() => {
    const t = targetRef.current;
    const c = currentRef.current;
    const nx = c.x + (t.x - c.x) * DAMPING;
    const ny = c.y + (t.y - c.y) * DAMPING;
    currentRef.current = { x: nx, y: ny };
    if (boxRef.current) {
      boxRef.current.style.transform = `rotateX(${nx}deg) rotateY(${ny}deg)`;
    }

    const dx = Math.abs(t.x - nx);
    const dy = Math.abs(t.y - ny);
    if (dx > 0.05 || dy > 0.05) {
      frameRef.current = requestAnimationFrame(tick);
    } else {
      currentRef.current = { x: t.x, y: t.y };
      if (boxRef.current) {
        boxRef.current.style.transform = `rotateX(${t.x}deg) rotateY(${t.y}deg)`;
      }
      frameRef.current = null;
    }
  }, []);

  const handlePointerEnter = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse") setActive(true);
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse") setActive(true);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!rootRef.current) return;
    const rect = rootRef.current.getBoundingClientRect();
    const localX = e.clientX - rect.left;
    const localY = e.clientY - rect.top;
    if (cursorRef.current) {
      cursorRef.current.style.transform =
        `translate3d(${localX}px, ${localY}px, 0) translate(-50%, -50%)`;
    }

    // Compute overCta by checking cursor against each CTA's bounding rect.
    // First filter out back-facing btns — their 2D projection rects overlap
    // the visible face, causing ghost hotspots. Walk up the DOM computing
    // cumulative transform; if the btn's +Z normal has negative Z in world
    // space, the btn is facing away from the viewer.
    const root = rootRef.current;
    const ctas = root.querySelectorAll<HTMLElement>(
      ".album-cube__face-hit, .album-cube__face-btn"
    );
    let over = false;
    let overFrontHit = false;
    for (const cta of ctas) {
      // Compute cumulative transform from root down to cta.
      let m = new DOMMatrix();
      let current: HTMLElement | null = cta;
      while (current && current !== root) {
        const t = getComputedStyle(current).transform;
        if (t && t !== "none") {
          m = new DOMMatrix(t).multiply(m);
        }
        current = current.parentElement;
      }
      // Transform local +Z direction (w=0 → skip translation) and check sign.
      const n = m.transformPoint(new DOMPoint(0, 0, 1, 0));
      if (n.z <= 0) continue; // back-facing

      const r = cta.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (
        e.clientX >= r.left && e.clientX <= r.right &&
        e.clientY >= r.top && e.clientY <= r.bottom
      ) {
        over = true;
        overFrontHit = cta.classList.contains("album-cube__face-hit");
        break;
      }
    }
    setOverCta(over);
    setOverFront(overFrontHit);

    if (frozenRef.current) return;
    const nx = (localX / rect.width) * 2 - 1;
    const ny = (localY / rect.height) * 2 - 1;

    const absX = Math.abs(nx);
    const absY = Math.abs(ny);
    const sx = Math.sign(nx);
    const sy = Math.sign(ny);

    const ay = clamp(-sx * axisResponse(absX) * MAX_ANGLE, -MAX_ANGLE, MAX_ANGLE);
    const ax = clamp(sy * axisResponse(absY) * MAX_ANGLE, -MAX_ANGLE, MAX_ANGLE);

    targetRef.current = { x: ax, y: ay };
    if (frameRef.current == null) {
      frameRef.current = requestAnimationFrame(tick);
    }
  }, [tick]);

  const reset = useCallback(() => {
    if (frameRef.current != null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    targetRef.current = { x: 0, y: 0 };
    currentRef.current = { x: 0, y: 0 };
    if (boxRef.current) {
      boxRef.current.style.transform = "rotateX(0deg) rotateY(0deg)";
    }
    setActive(false);
    setOverCta(false);
    setOverFront(false);
  }, []);

  const onCtaEnter = useCallback(() => setOverCta(true), []);
  const onCtaLeave = useCallback(() => setOverCta(false), []);

  const onCtaPress = useCallback(() => {
    frozenRef.current = true;
    setLoading(true);
    if (loadingTimerRef.current != null) window.clearTimeout(loadingTimerRef.current);
    loadingTimerRef.current = window.setTimeout(() => {
      frozenRef.current = false;
      setLoading(false);
      loadingTimerRef.current = null;
    }, 1200);
  }, []);

  useEffect(() => {
    return () => {
      if (loadingTimerRef.current != null) window.clearTimeout(loadingTimerRef.current);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className={`album-cube${active ? " is-active" : ""}${loading ? " is-loading" : ""}${overCta ? " is-over-cta" : ""}`}
      onPointerEnter={handlePointerEnter}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerLeave={reset}
      onPointerCancel={reset}
    >
      <Link ref={flatRef} href={href} className="album-cube__flat" aria-label={title}>
        {coverArtPath && (
          <Image
            src={coverArtPath}
            alt={title}
            className="album-cube__flat-img"
            width={800}
            height={800}
            sizes="(max-width: 720px) 50vw, (max-width: 1200px) 33vw, 280px"
            loading="lazy"
          />
        )}
      </Link>

      <div ref={stageRef} className="album-cube__stage" aria-hidden={!active}>
        <div ref={boxRef} className="album-cube__box">
          <div className="album-cube__face album-cube__face--front">
            <Link
              href={href}
              className="album-cube__face-hit"
              tabIndex={active ? 0 : -1}
              onPointerEnter={onCtaEnter}
              onPointerLeave={onCtaLeave}
              onPointerDown={onCtaPress}
              aria-label={`Listen to ${title}`}
            >
              {coverArtPath && (
                <Image
                  src={coverArtPath}
                  alt={title}
                  className="album-cube__face-img"
                  width={800}
                  height={800}
                  sizes="(max-width: 720px) 50vw, (max-width: 1200px) 33vw, 280px"
                  loading="lazy"
                />
              )}
            </Link>
          </div>

          <div className="album-cube__face album-cube__face--top">
            <Link
              href="/"
              className="album-cube__face-btn"
              tabIndex={active ? 0 : -1}
              onPointerEnter={onCtaEnter}
              onPointerLeave={onCtaLeave}
              onPointerDown={onCtaPress}
            >
              <span className="album-cube__face-btn-arrows" aria-hidden="true">
                <span>⌃</span><span>⌃</span><span>⌃</span><span>⌃</span>
              </span>
              <span className="album-cube__face-btn-label">Read</span>
              <span className="album-cube__face-btn-arrows" aria-hidden="true">
                <span>⌃</span><span>⌃</span><span>⌃</span><span>⌃</span>
              </span>
            </Link>
            <span className="album-cube__face-label">Lyrics</span>
            {chorus && (
              <div className="album-cube__face-chorus song-brief-card__chorus">
                {chorus}
              </div>
            )}
          </div>

          <div className="album-cube__face album-cube__face--right">
            {active && planeThreeVideo && (
              <video
                className="album-cube__face-video"
                src={planeThreeVideo}
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                aria-hidden="true"
              />
            )}
            <Link
              href="/"
              className="album-cube__face-btn"
              tabIndex={active ? 0 : -1}
              onPointerEnter={onCtaEnter}
              onPointerLeave={onCtaLeave}
              onPointerDown={onCtaPress}
            >
              <span className="album-cube__face-btn-arrows" aria-hidden="true">
                <span>⌃</span><span>⌃</span><span>⌃</span><span>⌃</span>
              </span>
              <span className="album-cube__face-btn-label">Watch</span>
              <span className="album-cube__face-btn-arrows" aria-hidden="true">
                <span>⌃</span><span>⌃</span><span>⌃</span><span>⌃</span>
              </span>
            </Link>
            <span className="album-cube__face-eyebrow">Plane 3</span>
            <span className="album-cube__face-label">The Visual</span>
          </div>

          <div className="album-cube__face album-cube__face--bottom">
            <Link
              href="/"
              className="album-cube__face-btn"
              tabIndex={active ? 0 : -1}
              onPointerEnter={onCtaEnter}
              onPointerLeave={onCtaLeave}
              onPointerDown={onCtaPress}
            >
              <span className="album-cube__face-btn-arrows" aria-hidden="true">
                <span>⌃</span><span>⌃</span><span>⌃</span><span>⌃</span>
              </span>
              <span className="album-cube__face-btn-label">Shop</span>
              <span className="album-cube__face-btn-arrows" aria-hidden="true">
                <span>⌃</span><span>⌃</span><span>⌃</span><span>⌃</span>
              </span>
            </Link>
            <span className="album-cube__face-eyebrow">Plane 6</span>
            <span className="album-cube__face-label">Merch</span>
          </div>

          <div className="album-cube__face album-cube__face--left">
            <Link
              href="/"
              className="album-cube__face-btn"
              tabIndex={active ? 0 : -1}
              onPointerEnter={onCtaEnter}
              onPointerLeave={onCtaLeave}
              onPointerDown={onCtaPress}
            >
              <span className="album-cube__face-btn-arrows" aria-hidden="true">
                <span>⌃</span><span>⌃</span><span>⌃</span><span>⌃</span>
              </span>
              <span className="album-cube__face-btn-label">Explore</span>
              <span className="album-cube__face-btn-arrows" aria-hidden="true">
                <span>⌃</span><span>⌃</span><span>⌃</span><span>⌃</span>
              </span>
            </Link>
            <span className="album-cube__face-eyebrow">Plane 5</span>
            <span className="album-cube__face-label">Message</span>
          </div>
        </div>
      </div>

      <div
        ref={cursorRef}
        className={`cube-cursor${overCta ? " cube-cursor--ping" : ""}${overFront ? " cube-cursor--listen" : ""}`}
        aria-hidden="true"
      >
        <span className="cube-cursor__ring cube-cursor__ring--1" />
        <span className="cube-cursor__ring cube-cursor__ring--2" />
        <span className="cube-cursor__ring cube-cursor__ring--3" />
        <span className="cube-cursor__dot" />
        <span className="cube-cursor__label">Listen</span>
      </div>

      {debug && debugEnabledRef.current && (
        <div className="album-cube__debug">
          <div>rot x: {debug.rotX.toFixed(1)}° y: {debug.rotY.toFixed(1)}°</div>
          <div>flat: {debug.flatW.toFixed(1)} × {debug.flatH.toFixed(1)} · scale {debug.flatScale.toFixed(3)}</div>
          <div>stage: {debug.stageW.toFixed(1)} × {debug.stageH.toFixed(1)}</div>
          <div>box: {debug.boxW.toFixed(1)} × {debug.boxH.toFixed(1)} · scale {debug.boxScale.toFixed(3)}</div>
          <div className="album-cube__debug-matrix">box tf: {debug.boxTransform}</div>
          <div className="album-cube__debug-matrix">flat tf: {debug.flatTransform}</div>
        </div>
      )}

    </div>
  );
}
