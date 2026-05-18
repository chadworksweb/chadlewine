"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { focalCropStyle } from "@/lib/focal-crop";
import { CubeWaterRenderer, type CubeFaceSource } from "./CubeWaterRenderer";
import { FaceWaterPresenter } from "./FaceWaterPresenter";

export interface DiscographyCubeFace {
  slot: number; // 1=front, 2=top, 3=right, 4=bottom, 5=left
  media_type: "image" | "video";
  media_path: string;
  focal_x: number | null;
  focal_y: number | null;
  zoom: number | null;
}

interface DiscographyCubeRadiantProps {
  title: string;
  href: string;
  coverArtPath: string | null;
  cardFocalX?: number | null;
  cardFocalY?: number | null;
  cardZoom?: number | null;
  faces: DiscographyCubeFace[];
}

const MAX_ANGLE = 90;
const DEADZONE = 0.125;
const SATURATION = 0.90;
const DAMPING = 0.05;
// Cursor-glow lerp factor. Lower = more lag / more sustained trail.
// 0.07 reads as "thumbprint pressing through pliable plastic" — the glow
// follows the pointer with a heavy, gel-like delay rather than snapping.
const GLOW_DAMPING = 0.07;
// Minimum screen distance the cursor must travel before we inject another
// drop into the GPU water sim. Smaller = denser wake. ~10px reads as a
// continuous finger-through-water disturbance; the wave equation handles the
// rest (radiating ripples, decay, refraction of the source image).
const DROP_GAP_PX = 10;

let cubesLocked = false;

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

function axisResponse(abs: number) {
  if (abs <= DEADZONE) return 0;
  if (abs >= SATURATION) return 1;
  const t = (abs - DEADZONE) / (SATURATION - DEADZONE);
  return t * t * (3 - 2 * t);
}

const SLOT_CLASS: Record<number, string> = {
  1: "disco-cube__face--front",
  2: "disco-cube__face--top",
  3: "disco-cube__face--right",
  4: "disco-cube__face--bottom",
  5: "disco-cube__face--left",
};

export function DiscographyCubeRadiant({
  title,
  href,
  coverArtPath,
  cardFocalX,
  cardFocalY,
  cardZoom,
  faces,
}: DiscographyCubeRadiantProps) {
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const frozenRef = useRef(false);
  const rootRef = useRef<HTMLAnchorElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const targetRef = useRef({ x: 0, y: 0 });
  const currentRef = useRef({ x: 0, y: 0 });
  const lastPointerTypeRef = useRef<string>("mouse");
  // Smoothed cursor screen position drives the per-face glow. Storing as a
  // separate signal (vs reusing rotation target) lets us pick a slower lerp
  // for the glow than for the cube tilt.
  const glowTargetRef = useRef<{ x: number; y: number } | null>(null);
  const glowCurrentRef = useRef<{ x: number; y: number } | null>(null);
  const glowFrameRef = useRef<number | null>(null);
  // Ring buffer of recent smoothed cursor positions for the wake trail.
  // Index 0 = head droplet (current cursor); higher indices = older.
  // Last screen position we injected a water drop from. When the cursor
  // moves > DROP_GAP_PX, we drop on every face the cursor projects into.
  const lastDropAtRef = useRef<{ x: number; y: number } | null>(null);
  // Single WebGL2 renderer for all 5 faces of this cube. Lazy-initialized on
  // first hover; persists across hover cycles; destroyed on unmount.
  const rendererRef = useRef<CubeWaterRenderer | null>(null);
  const [rendererReady, setRendererReady] = useState(false);

  // Build per-face source specs once. The renderer needs:
  //   - the imageSrc per slot (face media or cover fallback)
  //   - the crop params (focal point + zoom) to mimic CSS object-fit:cover
  const faceSources = useMemo<CubeFaceSource[]>(() => {
    const map = new Map<number, DiscographyCubeFace>();
    for (const f of faces) map.set(f.slot, f);
    return [1, 2, 3, 4, 5].map((slot) => {
      const face = map.get(slot);
      const fallbackToCover = !face && !!coverArtPath;
      const src =
        face?.media_type === "image"
          ? face.media_path
          : fallbackToCover
            ? coverArtPath
            : null;
      const fxRaw = face ? face.focal_x : cardFocalX ?? null;
      const fyRaw = face ? face.focal_y : cardFocalY ?? null;
      const zRaw = face ? face.zoom : cardZoom ?? null;
      return {
        src,
        fx: (fxRaw ?? 50) / 100,
        fy: (fyRaw ?? 50) / 100,
        zoom: zRaw ?? 1,
      };
    });
  }, [faces, coverArtPath, cardFocalX, cardFocalY, cardZoom]);

  const ensureRenderer = useCallback(() => {
    if (rendererRef.current) return rendererRef.current;
    const r = new CubeWaterRenderer(faceSources);
    rendererRef.current = r;
    setRendererReady(true);
    return r;
  }, [faceSources]);

  // Destroy the renderer when the cube unmounts. We keep it alive across
  // hover cycles intentionally — the whole point of this refactor is to
  // pay the WebGL setup cost once per cube, not once per hover.
  useEffect(() => {
    return () => {
      if (rendererRef.current) {
        rendererRef.current.destroy();
        rendererRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    cubesLocked = false;
  }, []);

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

  const dropOnFaces = useCallback((cx: number, cy: number) => {
    if (!boxRef.current) return;
    const renderer = rendererRef.current;
    if (!renderer) return;
    const faceEls = boxRef.current.querySelectorAll<HTMLElement>(".disco-cube__face");
    faceEls.forEach((face, idx) => {
      const fr = face.getBoundingClientRect();
      if (fr.width < 4 || fr.height < 4) return;
      const fx = ((cx - fr.left) / fr.width) * 100;
      const fy = ((cy - fr.top) / fr.height) * 100;
      // Only drop on faces whose projected rect actually contains the cursor —
      // prevents the same wake from rendering on every face simultaneously.
      if (fx < 0 || fx > 100 || fy < 0 || fy > 100) return;
      renderer.drop(idx, fx, fy, 0.22);
    });
  }, []);

  const tickGlow = useCallback(() => {
    const t = glowTargetRef.current;
    const c = glowCurrentRef.current;
    if (!t || !c) {
      glowFrameRef.current = null;
      return;
    }
    const nx = c.x + (t.x - c.x) * GLOW_DAMPING;
    const ny = c.y + (t.y - c.y) * GLOW_DAMPING;
    glowCurrentRef.current = { x: nx, y: ny };

    const last = lastDropAtRef.current;
    if (!last) {
      lastDropAtRef.current = { x: nx, y: ny };
    } else {
      const dx = nx - last.x;
      const dy = ny - last.y;
      if (Math.hypot(dx, dy) > DROP_GAP_PX) {
        dropOnFaces(nx, ny);
        lastDropAtRef.current = { x: nx, y: ny };
      }
    }

    if (Math.abs(t.x - nx) > 0.3 || Math.abs(t.y - ny) > 0.3) {
      glowFrameRef.current = requestAnimationFrame(tickGlow);
    } else {
      glowFrameRef.current = null;
    }
  }, [dropOnFaces]);

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

  const handlePointerEnter = useCallback((e: React.PointerEvent<HTMLAnchorElement>) => {
    if (cubesLocked && !frozenRef.current) return;
    if (e.pointerType === "mouse") {
      ensureRenderer();
      setActive(true);
    }
  }, [ensureRenderer]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLAnchorElement>) => {
    if (cubesLocked && !frozenRef.current) return;
    lastPointerTypeRef.current = e.pointerType;
    if (e.pointerType !== "mouse") {
      ensureRenderer();
      setActive(true);
    }
  }, [ensureRenderer]);

  // Drive the renderer's animation loop from the active state. The renderer
  // is kept alive (and its WebGL context retained) between hover cycles —
  // we only pause/resume the rAF tick.
  useEffect(() => {
    const r = rendererRef.current;
    if (!r) return;
    if (active) r.start();
    else r.stop();
  }, [active]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLAnchorElement>) => {
    if (cubesLocked && !frozenRef.current) return;
    if (frozenRef.current) return;
    if (!rootRef.current) return;
    const rect = rootRef.current.getBoundingClientRect();
    const localX = e.clientX - rect.left;
    const localY = e.clientY - rect.top;

    // Push smoothed cursor toward current pointer position. The glow ticker
    // lerps from current → target with GLOW_DAMPING, so the highlight drags
    // behind the cursor like a thumbprint sinking into pliable gel.
    glowTargetRef.current = { x: e.clientX, y: e.clientY };
    if (glowCurrentRef.current === null) {
      glowCurrentRef.current = { x: e.clientX, y: e.clientY };
    }
    if (glowFrameRef.current == null) {
      glowFrameRef.current = requestAnimationFrame(tickGlow);
    }

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
  }, [tick, tickGlow]);

  const reset = useCallback(() => {
    if (frozenRef.current) return;
    if (lastPointerTypeRef.current !== "mouse") return;
    if (frameRef.current != null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    targetRef.current = { x: 0, y: 0 };
    currentRef.current = { x: 0, y: 0 };
    if (glowFrameRef.current != null) {
      cancelAnimationFrame(glowFrameRef.current);
      glowFrameRef.current = null;
    }
    glowTargetRef.current = null;
    glowCurrentRef.current = null;
    lastDropAtRef.current = null;
    if (boxRef.current) {
      boxRef.current.style.transform = "rotateX(0deg) rotateY(0deg)";
    }
    setActive(false);
  }, []);

  // Tap-outside dismiss for touch/pen, mirroring ReleaseCubeRadiant.
  useEffect(() => {
    if (!active) return;
    if (lastPointerTypeRef.current === "mouse") return;
    const onDocPointerDown = (e: PointerEvent) => {
      const root = rootRef.current;
      if (!root) return;
      if (root.contains(e.target as Node)) return;
      if (frozenRef.current) return;
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
    };
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, [active]);

  const onClick = useCallback(() => {
    frozenRef.current = true;
    cubesLocked = true;
    setLoading(true);
  }, []);

  const cardStyle = focalCropStyle(cardFocalX, cardFocalY, cardZoom);

  // Build a slot→face map; fallback to cover art for any empty slot.
  const facesBySlot = new Map<number, DiscographyCubeFace>();
  for (const f of faces) facesBySlot.set(f.slot, f);

  return (
    <Link
      ref={rootRef}
      href={href}
      className={`disco-cube${active ? " is-active" : ""}${loading ? " is-loading" : ""}`}
      aria-label={title}
      onPointerEnter={handlePointerEnter}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerLeave={reset}
      onPointerCancel={reset}
      onClick={onClick}
    >
      <div className="disco-cube__flat">
        {coverArtPath && (
          <Image
            src={coverArtPath}
            alt={title}
            className="disco-cube__flat-img"
            width={800}
            height={800}
            sizes="(max-width: 720px) 50vw, (max-width: 1200px) 33vw, 280px"
            loading="lazy"
            style={cardStyle}
          />
        )}
      </div>

      <div className="disco-cube__stage" aria-hidden={!active}>
        <div ref={boxRef} className="disco-cube__box">
          {[1, 2, 3, 4, 5].map((slot) => {
            const face = facesBySlot.get(slot);
            const fallbackToCover = !face && coverArtPath;
            const style = face
              ? focalCropStyle(face.focal_x, face.focal_y, face.zoom)
              : cardStyle;
            // Image source for the GPU water sim — same path the static
            // <Image> uses, so the displaced render visually matches.
            const imageSrc =
              face?.media_type === "image"
                ? face.media_path
                : fallbackToCover
                  ? coverArtPath
                  : null;
            return (
              <div key={slot} className={`disco-cube__face ${SLOT_CLASS[slot]}`}>
                {face?.media_type === "video" && active && (
                  <video
                    src={face.media_path}
                    className="disco-cube__face-video"
                    style={style}
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    aria-hidden="true"
                  />
                )}
                {imageSrc && (
                  <Image
                    src={imageSrc}
                    alt=""
                    className="disco-cube__face-img"
                    width={800}
                    height={800}
                    sizes="(max-width: 720px) 50vw, (max-width: 1200px) 33vw, 280px"
                    loading="lazy"
                    style={style}
                    aria-hidden="true"
                  />
                )}
                {imageSrc && active && rendererReady && (
                  <FaceWaterPresenter
                    renderer={rendererRef.current}
                    faceIdx={slot - 1}
                    active={active}
                    className="disco-cube__face-water"
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Link>
  );
}
