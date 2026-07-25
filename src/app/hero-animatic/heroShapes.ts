import * as THREE from "three";
import type { MutableRefObject } from "react";

// Shared geometry, timing, palette and phase math for the Transcend the Machine
// hero. Kept framework-free so both the R3F scene and the DOM overlay driver
// read the exact same clock and the exact same beat boundaries.

export type Kind = "cube" | "octa" | "icosa" | "ring" | "wave";

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
  { key: "songs",   label: "Songs",   route: "/music/songs",  song: "Everything I Need", level: "L4 / DOOR", hue: "#b46bff", shape: "wave",  line: "The sirens were never the current. You were." },
  { key: "art",     label: "Art",     route: "/art",          song: "I Got The Key",     level: "L3 / KEY",  hue: "#3dff9e", shape: "icosa", line: "You were holding it the whole walk." },
  { key: "videos",  label: "Videos",  route: "/music-videos", song: "Finding Freedom",   level: "L5 / EGO",  hue: "#00e0ff", shape: "ring",  line: "No one handed you this. You wrote it." },
  { key: "merch",   label: "Merch",   route: "/merch",        song: "Machine",           level: "L1 / WAKE", hue: "#b46bff", shape: "cube",  line: "The loop was the lie." },
  { key: "writing", label: "Writing", route: "/read",         song: "See Through Me",    level: "L2 / SEE",  hue: "#00ff88", shape: "octa",  line: "You just stopped pretending it was solid." },
];

// PsycheAura constants (the icosahedron "language"): 4 golden-ratio-inset shells.
export const PHI = (1 + Math.sqrt(5)) / 2;
export const SHELLS = 4;

// Resting slot x-positions (world units). Spacing 4 across the 16:9 frame.
export const SLOT_X = [-8, -4, 0, 4, 8];

// Timeline (seconds). Names double as the HUD beat labels.
export const DUR = 6;
export const BEATS: { t0: number; t1: number; name: string }[] = [
  { t0: 0.0, t1: 1.0, name: "THE PULL" },
  { t0: 1.0, t1: 2.2, name: "THE TUNNEL" },
  { t0: 2.2, t1: 3.2, name: "THE BREAK" },
  { t0: 3.2, t1: 5.0, name: "THE ASSEMBLY" },
  { t0: 5.0, t1: 6.0, name: "THE REST" },
];
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
      g = new THREE.EdgesGeometry(new THREE.TorusGeometry(0.85, 0.3, 8, 28));
      break;
    case "wave":
      g = makeWaveGeo();
      break;
  }
  geoCache[kind] = g;
  return g;
}
