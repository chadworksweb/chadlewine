"use client";

// =====================================================================
// PsycheAura -- the ambient "energy field" that sits beside a song's
// Psyche Facts label (the empty column to the right of the 34rem card).
//
// A slow-rotating RECURSIVE wireframe: several nested icosahedra scaled in a
// golden-ratio sequence, each spinning on its own incommensurate axis so the
// moire between the shells never repeats -- it reads as a fractal solid folding
// through itself. Behind it, a soft radial aura breathes on its own slow clock.
// Everything is keyed to the song's tier colour (violet for an Ascended charge)
// and seeded off the slug so each song's field looks a little different.
//
// Deliberately Canvas 2D, not WebGL:
//  - The song page already holds a live WebGL context (CubeVisualizer). Browsers
//    cap concurrent contexts and drop the oldest during SPA nav, so a second one
//    here would be fragile. 2D also gives crisp hairline strokes, which is the
//    whole look (clinical line-art, not shaded glass).
//
// Lifecycle mirrors the ChadWorks hero canvases:
//  - DPR capped at 2; backing store sized from the host rect via ResizeObserver.
//  - rAF parks through an IntersectionObserver when the field scrolls off-screen
//    (rootMargin warms it ~one viewport ahead); dt clamped so a background-tab
//    resume never jumps.
//  - prefers-reduced-motion renders a single static frame and never loops.
//  - aria-hidden: purely decorative.
// =====================================================================

import { useEffect, useRef } from "react";

type Vec3 = [number, number, number];
type RGB = [number, number, number];

// ---- geometry (module-scope: built once, shared by every instance) ----------

const PHI = (1 + Math.sqrt(5)) / 2;

// The 12 icosahedron vertices as cyclic (0, +/-1, +/-PHI) permutations, then
// pushed onto the unit sphere.
const ICO_VERTS: Vec3[] = (() => {
  const raw: Vec3[] = [];
  const sign = [-1, 1];
  for (const a of sign)
    for (const b of sign) {
      raw.push([0, a, b * PHI]);
      raw.push([a, b * PHI, 0]);
      raw.push([b * PHI, 0, a]);
    }
  return raw.map((v) => {
    const len = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / len, v[1] / len, v[2] / len] as Vec3;
  });
})();

// Edges = the 30 vertex pairs at the minimum (shared) separation. Derived rather
// than hand-listed so the pairing can never drift out of sync with the verts.
const ICO_EDGES: [number, number][] = (() => {
  let min = Infinity;
  for (let i = 0; i < ICO_VERTS.length; i++)
    for (let j = i + 1; j < ICO_VERTS.length; j++) {
      const a = ICO_VERTS[i];
      const b = ICO_VERTS[j];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      if (d < min) min = d;
    }
  const edges: [number, number][] = [];
  const tol = min * 1.05;
  for (let i = 0; i < ICO_VERTS.length; i++)
    for (let j = i + 1; j < ICO_VERTS.length; j++) {
      const a = ICO_VERTS[i];
      const b = ICO_VERTS[j];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      if (d <= tol) edges.push([i, j]);
    }
  return edges;
})();

// ---- helpers ----------------------------------------------------------------

function hexToRgb(hex: string): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [128, 84, 188]; // #8054bc, the brand violet, as a safe default
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Cheap deterministic string hash -> a per-song phase offset so no two fields
// are rotationally identical.
function hashSeed(seed: string | number): number {
  const s = String(seed);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295; // 0..1
}

// Shortest distance (px) from a point to a line segment -- used to hit-test the
// cursor against the drawn wireframe edges so engagement hugs the actual lines.
function distToSeg(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

interface PsycheAuraProps {
  /** Tier colour, e.g. the Ascended violet. Drives strokes + aura. */
  hex?: string | null;
  /** Any stable per-song value (slug); seeds the rotation phases. */
  seed?: string | number;
}

// Number of nested shells and how fast the whole cluster turns (rad/s). Kept
// very low -- this is meant to be noticed only on a second look.
const SHELLS = 4;
const BASE_SPIN = 0.055;

export function PsycheAura({ hex, seed = 0 }: PsycheAuraProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const [r, g, b] = hexToRgb(hex || "#8054bc");
    const rgba = (a: number) => `rgba(${r}, ${g}, ${b}, ${a})`;
    const phase0 = hashSeed(seed) * Math.PI * 2;

    // Per-shell config: golden-ratio scale falloff (self-similar), and a triad of
    // incommensurate axis rates so shells drift against each other forever.
    const shells = Array.from({ length: SHELLS }, (_, i) => ({
      scale: Math.pow(1 / PHI, i), // 1, 0.618, 0.382, 0.236
      // irrational-ish multipliers -> the combined motion never loops
      rx: 0.61 + i * 0.17,
      ry: 0.93 - i * 0.13,
      rz: 0.29 + i * 0.09,
      phase: phase0 + i * 1.7,
      // faint inner shells: dimmer as they recede in scale
      alpha: 0.5 - i * 0.09,
    }));

    let DPR = 1;
    let cssW = 0;
    let cssH = 0;
    const resize = () => {
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (w < 1 || h < 1) return;
      cssW = w;
      cssH = h;
      const bw = Math.round(w * DPR);
      const bh = Math.round(h * DPR);
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw;
        canvas.height = bh;
      }
      // Draw in CSS pixels; the backing store handles the retina scale.
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Touch devices can't hover -- drop all cursor interaction (tilt, glow,
    // pause, tooltip) there and just let the field breathe.
    const noHover = window.matchMedia("(hover: none)").matches;
    const tip = tipRef.current;

    // ---- interaction state ------------------------------------------------
    // Two distinct zones, both measured from the field centre:
    //  - PROXIMITY (broad): the cluster leans toward the cursor, eased, with a
    //    linear falloff so it only reacts once the pointer is genuinely near.
    //  - CENTRE (~20%): the pause hotspot -- shows the Pause/Resume tooltip and
    //    is the only region where a click toggles the freeze.
    const MAXTILT = 0.85; // rad (~49deg) at the form's edge -- a good push of spin
    const PROX_PAD = 8;  // px -- engagement band around the actual wireframe lines
    let engaged = false;
    let overCentre = false;
    let paused = false;
    let tiltX = 0, tiltY = 0;
    let velX = 0, velY = 0;      // angular velocity -> momentum on the tilt spring
    let targetTiltX = 0, targetTiltY = 0;
    let glowAmt = 0;            // 0..1 eased centre-hover glow (fades, never flashes)
    // Flat [x1,y1,x2,y2, ...] of the last frame's projected edges, in CSS px.
    // onMove hit-tests the cursor against these so proximity hugs the drawing.
    let segments: number[] = [];

    const updateAffordance = () => {
      canvas.style.cursor = overCentre ? "pointer" : "default";
      if (!tip) return;
      tip.textContent = paused ? "Resume" : "Pause";
      tip.classList.toggle("is-visible", overCentre);
    };

    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const cx = rect.width * 0.5;
      const cy = rect.height * 0.5;
      const size = Math.min(rect.width, rect.height);

      // Engage only within a few px of a real edge (from the last frame), so the
      // hit area is the wireframe itself, not a big invisible disc.
      let minD = Infinity;
      for (let i = 0; i + 3 < segments.length; i += 4) {
        const d = distToSeg(x, y, segments[i], segments[i + 1], segments[i + 2], segments[i + 3]);
        if (d < minD) {
          minD = d;
          if (minD <= PROX_PAD) break;
        }
      }
      engaged = minD <= PROX_PAD;
      overCentre = Math.hypot(x - cx, y - cy) < size * 0.12; // pause hotspot

      if (engaged) {
        const nx = Math.max(-1, Math.min(1, (x - cx) / (size * 0.5)));
        const ny = Math.max(-1, Math.min(1, (y - cy) / (size * 0.5)));
        targetTiltY = nx * MAXTILT;
        targetTiltX = ny * MAXTILT;
      } else {
        targetTiltX = 0;
        targetTiltY = 0;
      }

      // tooltip rides the cursor (positioned within the host, CSS px)
      if (tip && overCentre) {
        tip.style.left = `${x}px`;
        tip.style.top = `${y}px`;
      }
      updateAffordance();
    };
    const onLeave = () => {
      engaged = false;
      overCentre = false;
      targetTiltX = 0;
      targetTiltY = 0;
      updateAffordance();
    };
    const onClick = () => {
      if (reduce || !overCentre) return; // pause only via the centre hotspot
      paused = !paused;
      updateAffordance();
      maybeRun();
    };
    if (!noHover) {
      window.addEventListener("pointermove", onMove);
      window.addEventListener("blur", onLeave);
      host.addEventListener("pointerleave", onLeave);
      canvas.addEventListener("click", onClick);
    }

    // A rotated + projected point. camZ pulls the camera back; f is the focal
    // length. Returns screen x/y (CSS px) and a 0..1 depth for alpha shading.
    const project = (
      v: Vec3,
      s: number,
      sinx: number, cosx: number,
      siny: number, cosy: number,
      sinz: number, cosz: number,
      cx: number, cy: number, unit: number
    ) => {
      let x = v[0] * s;
      let y = v[1] * s;
      let z = v[2] * s;
      // X
      let ny = y * cosx - z * sinx;
      let nz = y * sinx + z * cosx;
      y = ny; z = nz;
      // Y
      let nx = x * cosy + z * siny;
      nz = -x * siny + z * cosy;
      x = nx; z = nz;
      // Z
      nx = x * cosz - y * sinz;
      ny = x * sinz + y * cosz;
      x = nx; y = ny;

      const camZ = 3.3;
      const f = 2.4;
      const p = f / (camZ - z);
      return {
        x: cx + x * p * unit,
        y: cy - y * p * unit,
        depth: (z + 1) * 0.5, // 0 far .. 1 near
      };
    };

    let raf = 0;
    let running = false;
    let t0 = 0;
    let prevTs = 0;
    let elapsed = 0;

    const renderFrame = (now: number) => {
      if (!t0) {
        t0 = now;
        prevTs = now;
      }
      const dt = Math.min(0.05, (now - prevTs) / 1000);
      prevTs = now;
      elapsed += dt;
      const t = elapsed;

      // spring the cursor tilt toward its target, underdamped so it carries
      // momentum -- overshoots and coasts to rest instead of snapping. When the
      // pointer leaves (target 0) it swings back with the same inertia.
      const STIFF = 74;
      const DAMP = 8;
      velX += ((targetTiltX - tiltX) * STIFF - velX * DAMP) * dt;
      velY += ((targetTiltY - tiltY) * STIFF - velY * DAMP) * dt;
      tiltX += velX * dt;
      tiltY += velY * dt;

      // fade the centre-hover glow in/out rather than flashing it on/off
      glowAmt += ((overCentre ? 1 : 0) - glowAmt) * Math.min(1, dt * 5);

      const w = cssW;
      const h = cssH;
      if (w < 1 || h < 1) return;
      ctx.clearRect(0, 0, w, h);

      const cx = w * 0.5;
      const cy = h * 0.5;
      const size = Math.min(w, h);
      // gentle breathing scale, on its own slow clock
      const breathe = 1 + 0.05 * Math.sin(t * 0.11 + phase0);
      // Shape at 1.5x, but never wider than the canvas so it can't clip in the
      // narrow desktop side strip. The aura bloom below is left as-is.
      const unit = Math.min(size * 0.51 * breathe, w * 0.42);

      // --- aura: a soft radial bloom, pulsing counter to the breath ----------
      const auraR = size * (0.52 + 0.05 * Math.sin(t * 0.09 + phase0 + 1.3));
      const pulse = 0.5 + 0.5 * Math.sin(t * 0.13 + phase0);
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, auraR);
      grad.addColorStop(0, rgba(0.16 + 0.06 * pulse));
      grad.addColorStop(0.45, rgba(0.05 + 0.02 * pulse));
      grad.addColorStop(1, rgba(0));
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // --- nested wireframe shells, additive so crossings glow --------------
      ctx.globalCompositeOperation = "lighter";
      ctx.lineWidth = 1;
      ctx.lineCap = "round";
      const seg: number[] = [];
      const innermost = shells.length - 1;
      for (let si = 0; si < shells.length; si++) {
        const sh = shells[si];
        // autonomous drift + the shared cursor tilt (added to every shell so
        // the whole cluster leans coherently toward the pointer)
        const ax = t * BASE_SPIN * sh.rx + sh.phase + tiltX;
        const ay = t * BASE_SPIN * sh.ry + sh.phase * 0.7 + tiltY;
        const az = t * BASE_SPIN * sh.rz + sh.phase * 0.4;
        const sinx = Math.sin(ax), cosx = Math.cos(ax);
        const siny = Math.sin(ay), cosy = Math.cos(ay);
        const sinz = Math.sin(az), cosz = Math.cos(az);
        const s = sh.scale;

        // hovering the pause hotspot fades a glow up on the innermost shape
        const glow = si === innermost && glowAmt > 0.01;
        if (glow) {
          ctx.shadowColor = rgba(0.9);
          ctx.shadowBlur = 12 * glowAmt;
        }

        const pts = ICO_VERTS.map((v) =>
          project(v, s, sinx, cosx, siny, cosy, sinz, cosz, cx, cy, unit)
        );
        for (const [i, j] of ICO_EDGES) {
          const a = pts[i];
          const p2 = pts[j];
          seg.push(a.x, a.y, p2.x, p2.y);
          // fade edges by their mean depth so the far side recedes
          const d = (a.depth + p2.depth) * 0.5;
          let edgeAlpha = sh.alpha * (0.25 + 0.75 * d);
          if (glow) {
            const boosted = Math.min(0.95, edgeAlpha * 2.1 + 0.2);
            edgeAlpha += (boosted - edgeAlpha) * glowAmt;
          }
          ctx.strokeStyle = rgba(edgeAlpha);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
        if (glow) ctx.shadowBlur = 0;
      }
      segments = seg;

      // a small bright core where the shells converge
      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, unit * 0.18);
      core.addColorStop(0, rgba(0.5 + 0.2 * pulse));
      core.addColorStop(1, rgba(0));
      ctx.fillStyle = core;
      ctx.fillRect(0, 0, w, h);

      ctx.globalCompositeOperation = "source-over";
    };

    const tick = (now: number) => {
      renderFrame(now);
      if (running && !reduce) raf = requestAnimationFrame(tick);
    };
    const start = () => {
      if (running) return;
      running = true;
      prevTs = 0;
      if (reduce) requestAnimationFrame((n) => renderFrame(n));
      else raf = requestAnimationFrame(tick);
    };
    const stop = () => {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    // Run only while on-screen AND not paused-by-click; park otherwise (a click
    // pause survives scrolling away and back -- the field stays frozen).
    let visible = false;
    function maybeRun() {
      if (visible && !paused) start();
      else stop();
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) visible = e.isIntersecting;
        maybeRun();
      },
      { root: null, rootMargin: "100% 0px 100% 0px", threshold: 0 }
    );
    io.observe(host);

    return () => {
      stop();
      io.disconnect();
      ro.disconnect();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("blur", onLeave);
      host.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("click", onClick);
    };
  }, [hex, seed]);

  return (
    <div ref={hostRef} className="psyche-aura__host" aria-hidden="true">
      <canvas ref={canvasRef} className="psyche-aura__canvas" />
      <div ref={tipRef} className="psyche-aura__tip">Pause</div>
    </div>
  );
}

export default PsycheAura;
