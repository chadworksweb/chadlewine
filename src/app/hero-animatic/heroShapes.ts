import * as THREE from "three";
import type { MutableRefObject } from "react";

// Shared geometry, timing, palette and phase math for the Transcend the Machine
// hero. Kept framework-free so both the R3F scene and the DOM overlay driver
// read the exact same clock and the exact same beat boundaries.

export type Kind = "cube" | "octa" | "icosa" | "ring" | "wave" | "star";

export interface Door {
  key: string;
  label: string;
  route: string;
  song: string;
  level: string;
  hue: string;
  shape: Kind;
  line: string;
}

// The five doors: each a real live route, a Rising Compass tier hue, and a
// distinct solid. Order = left-to-right in the resting menu.
export const DOORS: Door[] = [
  { key: "music",   label: "Music",   route: "/music",        song: "Everything I Need", level: "L4 / DOOR", hue: "#4d7cff", shape: "icosa", line: "The sirens were never the current. You were." },
  { key: "art",     label: "Art",     route: "/art",          song: "I Got The Key",     level: "L3 / KEY",  hue: "#3dff9e", shape: "star",  line: "You were holding it the whole walk." },
  { key: "videos",  label: "Videos",  route: "/music-videos", song: "Finding Freedom",   level: "L5 / EGO",  hue: "#00e0ff", shape: "ring",  line: "No one handed you this. You wrote it." },
  { key: "merch",   label: "Merch",   route: "/merch",        song: "Machine",           level: "L1 / WAKE", hue: "#b46bff", shape: "cube",  line: "The loop was the lie." },
  { key: "writing", label: "Writing", route: "/read",         song: "See Through Me",    level: "L2 / SEE",  hue: "#ffc48a", shape: "octa",  line: "You just stopped pretending it was solid." },
];

// PsycheAura constants (the icosahedron "language"): 4 golden-ratio-inset shells.
export const PHI = (1 + Math.sqrt(5)) / 2;
export const SHELLS = 4;

// How fast each solid's shells dim as they nest inward, per shell index.
//
// One shared value cannot serve all five, because the shapes are nowhere near
// equal in line count: cube, octahedron and star carry 12 edges each and the
// icosahedron 30, but the torus at 8x28 carries roughly 450. Under additive
// blending with depthWrite off, every one of those lines ADDS, so at the shared
// falloff the ring's inner shells stacked into a solid glob while the sparse
// solids looked right. Denser solids therefore fade faster per shell.
//
// Coarsening the torus instead was tried and reverted: the dense tessellation
// is what makes it read as clearly round.
export const SHELL_FALLOFF: Record<Kind, number> = {
  cube: 0.11,
  octa: 0.11,
  star: 0.11,
  wave: 0.11,
  icosa: 0.11,
  ring: 0.175,
};

// Resting slot x-positions (world units). Spacing 4 across the 16:9 frame.
export const SLOT_X = [-8, -4, 0, 4, 8];

// ---- responsive rest layout -------------------------------------------------
//
// The composition was authored at one aspect and nothing compensated for any
// other. Visible world half-width is WORLD_HALF_H * aspect, so it moves with the
// viewport, while the DOM overlay's percentages were constant. The stage's
// aspect-ratio:16/9 lock was the only thing holding the two together, and going
// full-bleed removes exactly that lock.
//
// Everything below is a pure function of aspect, and every consumer (the scene,
// the DOM labels) reads THIS, so the shapes and their labels cannot drift apart.
//
// Vertical needs no compensation at all: the camera's vertical fov is fixed, so
// a shape is always the same fraction of viewport height whatever the aspect.
// Only horizontal moves.
export const CAM_FOV = 55; // vertical, degrees
export const CAM_Z_REST = 13.4;
// World half-height at the z=0 plane. Constant, by the note above.
export const WORLD_HALF_H = Math.tan((CAM_FOV * Math.PI) / 360) * CAM_Z_REST;

// Geometry radii, so a door's true on-screen extent is known rather than
// guessed. Getting these wrong only costs margin, but the Music door already
// changed solid once, so this is a table rather than a magic number.
export const SHAPE_R: Record<Kind, number> = {
  icosa: 1.0,
  octa: 1.0,
  star: 1.18, // tetrahedron circumradius
  ring: 1.15, // torus 0.85 + 0.3
  cube: 1.169, // half space-diagonal of a 1.35 box
  wave: 1.25, // retired, kept so the record stays total
};
export const DOOR_SCALE = 1.2; // the rested group scale
const BREATHE_MAX = 1.035; // the idle breathe, counted so it never clips
const doorR = (k: Kind) => SHAPE_R[k] * DOOR_SCALE * BREATHE_MAX;

// Portrait cannot hold one row of five: at 9:16 the frame is 3.2 world units
// wide either side of centre and the row needs 9.2. Below this aspect the menu
// becomes a 3-over-2 grid instead. Row 1 takes Music/Art/Videos, row 2 the
// remaining pair, indented, which is the layout that keeps the shapes readable
// (~85px on a phone) instead of shrinking a single row to ~52px.
export const GRID_ASPECT = 1.0;
const GRID_X = [-4, 0, 4, -2, 2];
const GRID_ROW = [0, 0, 0, 1, 1];
const GRID_ROW_SEP = 2.9;

// 8% of the visible half-width is left outside the outermost shape so it never
// kisses the frame edge.
const MARGIN = 0.92;

// The widest reach of each arrangement, measured off the real radii.
const reach = (xs: number[]) =>
  DOORS.reduce((m, d, i) => Math.max(m, Math.abs(xs[i]) + doorR(d.shape)), 0);
const FIT_ROW = reach(SLOT_X) / MARGIN;
const FIT_GRID = reach(GRID_X) / MARGIN;

// Tallest shape per row, so labels in one row share a baseline instead of
// stepping up and down with each solid's radius.
const rowMaxR = (row: number) =>
  DOORS.reduce((m, d, i) => (GRID_ROW[i] === row ? Math.max(m, doorR(d.shape)) : m), 0);
const ROW_MAX_R = DOORS.reduce((m, d) => Math.max(m, doorR(d.shape)), 0);

// Label gap below a shape, in % of viewport height, at k = 1. The row value is
// derived so that at 16:9 the labels land exactly where they always have.
const GAP_ROW = 10.74;
const GAP_GRID = 4.5;

export interface HeroSlot {
  x: number; // world units
  y: number; // world units
  leftPct: number; // projected horizontal centre, % of frame
  labelTopPct: number; // where the DOM label block starts, % of frame
}
export interface HeroLayout {
  k: number; // one scale on both spacing and door size
  grid: boolean;
  halfW: number; // visible world half-width at this aspect
  slots: HeroSlot[];
}

const layoutCache = new Map<number, HeroLayout>();

export function heroLayout(aspect: number): HeroLayout {
  // Quantised so the per-frame callers hit the cache instead of rebuilding.
  const key = Math.round(aspect * 1000);
  const hit = layoutCache.get(key);
  if (hit) return hit;

  const halfW = WORLD_HALF_H * (key / 1000);
  const grid = key / 1000 < GRID_ASPECT;
  // Capped at 1, so every aspect at or above 3:2 is the authored composition
  // untouched rather than something merely close to it.
  const k = Math.min(1, halfW / (grid ? FIT_GRID : FIT_ROW));

  const slots: HeroSlot[] = DOORS.map((d, i) => {
    const x = (grid ? GRID_X[i] : SLOT_X[i]) * k;
    const y = grid ? (GRID_ROW[i] === 0 ? 1 : -1) * GRID_ROW_SEP * k : 0;
    const r = (grid ? rowMaxR(GRID_ROW[i]) : ROW_MAX_R) * k;
    const gap = (grid ? GAP_GRID : GAP_ROW) * k;
    return {
      x,
      y,
      leftPct: 50 + (x / halfW) * 50,
      labelTopPct: 50 - (y / WORLD_HALF_H) * 50 + (r / WORLD_HALF_H) * 50 + gap,
    };
  });

  const out = { k, grid, halfW, slots };
  layoutCache.set(key, out);
  return out;
}

// The server has no viewport, so the first render uses the authored 16:9
// composition. A ResizeObserver corrects it on mount. This also means the
// pre-hydration HTML carries sensible positions rather than nothing.
export const LAYOUT_16_9 = heroLayout(16 / 9);

// Timeline (seconds). Names double as the HUD beat labels.
export const DUR = 11.6;
export const BEATS: { t0: number; t1: number; name: string }[] = [
  { t0: 0.0, t1: 1.0, name: "THE PULL" },
  { t0: 1.0, t1: 2.2, name: "THE TUNNEL" },
  { t0: 2.2, t1: 3.2, name: "THE BREAK" },
  { t0: 3.2, t1: 5.0, name: "THE ASSEMBLY" },
  { t0: 5.0, t1: 5.9, name: "THE REST" },
  { t0: 5.9, t1: 8.0, name: "THE ADDRESS" },
  { t0: 8.0, t1: 11.6, name: "THE NAME" },
];

// The copy. Both live here rather than in the markup because the driver needs
// the lengths to compute the reveal, and two sources would drift apart.
export const SAID_TEXT = "you are now tapped in with the deprogrammer";
export const MARK_TEXT = "Chad Lewine";

// THE ADDRESS: the line types in. It waits out a full beat of stillness after
// the menu has settled (doors are fully in at 5.75) so it reads as arriving,
// not as part of the assembly. 43 characters across 1.9s is ~44ms each --
// brisk terminal cadence. The chadworks hero types at 92ms, but that is a
// 9-character wordmark; at this length the same rate would run four seconds.
export const SAID_IN = 5.95;
export const SAID_OUT = 7.85;

// THE NAME: the wordmark glitches in LAST, a beat after the line has finished
// typing, and takes a full 3s to settle.
export const MARK_IN = 8.05;
export const MARK_OUT = 11.05;
export function beatName(t: number): string {
  const c = Math.min(t, DUR);
  for (const b of BEATS) if (c < b.t1) return b.name;
  return BEATS[BEATS.length - 1].name;
}

// Palette.
export const COL_PERI = new THREE.Color("#8b9cf7"); // where the shapes resolve from
export const COL_VOID = "#07070d";

// ---- phase math -------------------------------------------------------------
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, x: number) => a + (b - a) * x;
export function smooth(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
export const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
export function backOut(x: number): number {
  const c = 1.70158;
  return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
}

// ---- shared clock -----------------------------------------------------------
// One animation clock read identically by every useFrame and by the HUD driver,
// so nothing can drift. t runs past DUR so the rested menu keeps its idle.
export interface HeroCtl {
  tRef: MutableRefObject<number>; // the animation clock, advanced by ClockDriver
  playingRef: MutableRefObject<boolean>;
  scrubRef: MutableRefObject<number | null>; // non-null while the scrubber is dragged
  stepRef: MutableRefObject<number>; // a pending frame-step (seconds), applied once
  resetRef: MutableRefObject<boolean>; // replay request
}

// DOM nodes the in-canvas HUD driver writes to each frame.
export interface HeroHud {
  beatRef: MutableRefObject<HTMLElement | null>;
  tcRef: MutableRefObject<HTMLElement | null>;
  floodRef: MutableRefObject<HTMLDivElement | null>;
  doorsRef: MutableRefObject<HTMLDivElement | null>;
  titleRef: MutableRefObject<HTMLParagraphElement | null>;
  markRef: MutableRefObject<HTMLSpanElement | null>;
  scrubEl: MutableRefObject<HTMLInputElement | null>;
  playBtnRef: MutableRefObject<HTMLButtonElement | null>;
}
// t is driven by ClockDriver; the elapsed arg is ignored (kept so the existing
// call sites need no change).
export function heroT(_elapsed: number, ctl: HeroCtl): number {
  return ctl.tRef.current;
}

// ---- geometry (built once, shared across every shell) -----------------------
const geoCache: Partial<Record<Kind, THREE.BufferGeometry>> = {};

// Retired: the Music door took the icosahedron. Kept because this is the only
// build of the waveform and it read thin/scribbly nested rather than wrong --
// if a sixth door ever wants it, it needs thicker strokes before reuse.
function makeWaveGeo(): THREE.BufferGeometry {
  const pts: number[] = [];
  const N = 48;
  const W = 1.25;
  const A = 0.42;
  let px = 0;
  let py = 0;
  for (let i = 0; i <= N; i++) {
    const x = (i / N) * 2 - 1;
    const y = A * Math.sin(x * Math.PI * 3) * Math.cos(x * 1.1);
    const wx = x * W;
    if (i > 0) pts.push(px, py, 0, wx, y, 0);
    px = wx;
    py = y;
  }
  for (let i = 0; i <= N; i += 3) {
    const x = (i / N) * 2 - 1;
    const yb = A * Math.sin(x * Math.PI * 3) * Math.cos(x * 1.1);
    const h = 0.12 + 0.22 * Math.abs(Math.sin(x * Math.PI * 2));
    pts.push(x * W, yb - h, 0, x * W, yb + h, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  return g;
}

// Art's solid: a stella octangula (two interpenetrating tetrahedra). Picked for
// SILHOUETTE separation -- next to a ball, a ring, a square and a diamond, the
// row needs one spiked star that cannot be confused with any of them at menu
// size. A dodecahedron was the obvious alternative and was rejected: nested and
// spinning in wireframe it reads as another icosahedron.
//
// The second tetrahedron is negated, NOT rotated. TetrahedronGeometry's four
// vertices are a diagonal subset of a cube's corners, so rotating one by PI on
// any axis maps it back onto itself and you get no star at all. Scaling by -1
// picks up the other four corners, which is the actual dual.
function makeStarGeo(): THREE.BufferGeometry {
  const R = 1.18;
  const up = new THREE.EdgesGeometry(new THREE.TetrahedronGeometry(R, 0));
  const dn = new THREE.EdgesGeometry(new THREE.TetrahedronGeometry(R, 0));
  dn.scale(-1, -1, -1);
  const a = up.getAttribute("position").array as Float32Array;
  const b = dn.getAttribute("position").array as Float32Array;
  const pts = new Float32Array(a.length + b.length);
  pts.set(a, 0);
  pts.set(b, a.length);
  up.dispose();
  dn.dispose();
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  return g;
}

export function getGeo(kind: Kind): THREE.BufferGeometry {
  let g = geoCache[kind];
  if (g) return g;
  switch (kind) {
    case "cube":
      g = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.35, 1.35, 1.35));
      break;
    case "octa":
      g = new THREE.EdgesGeometry(new THREE.OctahedronGeometry(1.0, 0));
      break;
    case "icosa":
      g = new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(1.0, 0));
      break;
    case "ring":
      // Stays at 8x28. Coarsening this to thin the glob was tried and reverted:
      // the dense tessellation is exactly what makes the ring read as CLEARLY
      // round, and that is the point of the shape. The nested-glob problem is
      // solved on opacity instead -- see SHELL_FALLOFF.
      g = new THREE.EdgesGeometry(new THREE.TorusGeometry(0.85, 0.3, 8, 28));
      break;
    case "wave":
      g = makeWaveGeo();
      break;
    case "star":
      g = makeStarGeo();
      break;
  }
  geoCache[kind] = g;
  return g;
}
