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
  { key: "videos",  label: "Videos",  route: "/videos", song: "Finding Freedom",   level: "L5 / EGO",  hue: "#00e0ff", shape: "ring",  line: "No one handed you this. You wrote it." },
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

// HOW BRIGHT THE WIREFRAMES ARE DRAWN. The outermost shell's line alpha, which
// the shells below step down from by SHELL_FALLOFF. Under NormalBlending over
// the void this is not a hint, it is the answer: a line lands at exactly
// alpha * hue, so these numbers ARE the fraction of the hue that reaches the
// frame.
//
// TWO VALUES, because the doors are asked for two different things. Out of the
// core they are debris going past at speed, read against a frame that is
// filling with streaks. In the menu they are the navigation: still, looked AT
// rather than glimpsed, and carrying a label. Only the menu is lifted.
//
// The handover costs nothing. The eject path ends at 2.2 and the menu path
// fades in on smooth(2.5, 3.2, t), so the doors sit at zero alpha across the
// switch and there is no frame in which a value change could show. The break
// flood whites the frame out over that same window in any case.
export const SHELL_ALPHA_EJECT = 0.62;
export const SHELL_ALPHA_MENU = 0.82;

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

// THE TOP ROW SITS LOWER. Grid only, because a top row is something only the
// 3-over-2 arrangement has, so this is portrait by construction and needs no
// media query. Stated in px because that is how it was asked for and how it is
// judged, on a phone; the layout converts it into both currencies it deals in
// (world units for the shapes, % of frame height for the cells) so a row cannot
// half-move.
// The cap in heroLayout means values past the inter-row half-band stop taking
// effect: at that point the row has travelled the whole gap and further travel
// would put its label through the row below. Measured at 390x844, that band is
// 95.8px, and taking all of it leaves row 1's shapes starting exactly at the top
// edge of their own hit cell. Around 55px is where row 1 keeps its shapes fully
// inside their cell, so this sits just under that.
export const GRID_ROW0_DROP_PX = 50;

// 8% of the visible half-width is left outside the outermost shape so it never
// kisses the frame edge.
const MARGIN = 0.92;

// The widest reach of each arrangement, measured off the real radii.
const reach = (xs: number[]) =>
  DOORS.reduce((m, d, i) => Math.max(m, Math.abs(xs[i]) + doorR(d.shape)), 0);
const FIT_ROW = reach(SLOT_X) / MARGIN;
const FIT_GRID = reach(GRID_X) / MARGIN;

// Each door owns a CELL: a tall box covering its shape with the label at the
// bottom, which is both the hover affordance (the tier-hue glow washes the whole
// column, not just the text) and the click target. Cells tile edge to edge and
// never overlap, so a pointer anywhere in the menu belongs to exactly one door.
//
// Cell width is the slot spacing, which makes tiling exact by construction: the
// gap between two centres and the width of one cell are the same number.
// At 16:9 with k = 1 this reproduces the authored 16% / 20% / 58% exactly.
const CELL_TOP_ROW = 30; // half-height above centre at k = 1 (centre 50 -> top 20)
const CELL_H_ROW = 58;

export interface HeroSlot {
  x: number; // world units
  y: number; // world units
  leftPct: number; // projected horizontal centre, % of frame
  cellTopPct: number; // hover/hit column, % of frame
  cellHeightPct: number;
  cellWidthPct: number;
}
export interface HeroLayout {
  k: number; // one scale on both spacing and door size
  grid: boolean;
  halfW: number; // visible world half-width at this aspect
  slots: HeroSlot[];
}

const layoutCache = new Map<number, HeroLayout>();

// frameH is the stage's height in CSS px, and it is optional because the server
// has no viewport to measure. It buys exactly one thing: GRID_ROW0_DROP_PX is a
// pixel quantity, and aspect alone cannot turn pixels into either world units or
// percentages. Both callers already hold it, and both hold the SAME box (the
// scene reads its canvas, the overlay observes the stage, and the canvas fills
// the stage), so passing it keeps this a single source of truth rather than
// introducing a second one.
export function heroLayout(aspect: number, frameH = 0): HeroLayout {
  // Quantised so the per-frame callers hit the cache instead of rebuilding. Both
  // inputs are in the key now: the same aspect at a different height is a
  // different layout, and returning the cached one would ignore the drop.
  const aq = Math.round(aspect * 1000);
  const key = aq * 100000 + Math.round(frameH);
  const hit = layoutCache.get(key);
  if (hit) return hit;

  const halfW = WORLD_HALF_H * (aq / 1000);
  const grid = aq / 1000 < GRID_ASPECT;
  // Capped at 1, so every aspect at or above 3:2 is the authored composition
  // untouched rather than something merely close to it.
  const k = Math.min(1, halfW / (grid ? FIT_GRID : FIT_ROW));

  // Half the vertical gap between the two grid rows, as % of frame height. Grid
  // cells are twice this tall, so the pair tiles the whole menu band and the
  // split falls exactly on the centre line: no overlap, no dead strip.
  const halfBand = ((GRID_ROW_SEP * k) / WORLD_HALF_H) * 50;
  // Slot spacing is 4k world in both arrangements, and the cell is one spacing
  // wide, so centre-to-centre distance and cell width are the same number.
  const cellWidthPct = ((2 * k) / halfW) * 100;

  // The row-0 drop in the two currencies this layout deals in. Capped at
  // halfBand, which is the whole gap between the rows: past that the cell would
  // carry row 0's label down through row 1's shape and the two would be fighting
  // for the same pointer.
  const dropPct =
    grid && frameH > 0 ? Math.min((GRID_ROW0_DROP_PX / frameH) * 100, halfBand) : 0;
  // % of frame height into world units. The full frame is 2 * WORLD_HALF_H tall.
  const dropWorld = (dropPct / 50) * WORLD_HALF_H;

  const slots: HeroSlot[] = DOORS.map((d, i) => {
    const top = grid && GRID_ROW[i] === 0;
    const x = (grid ? GRID_X[i] : SLOT_X[i]) * k;
    // Minus, because world +y is up and the row is going down.
    const y = (grid ? (GRID_ROW[i] === 0 ? 1 : -1) * GRID_ROW_SEP * k : 0) - (top ? dropWorld : 0);
    return {
      x,
      y,
      leftPct: 50 + (x / halfW) * 50,
      // Row 0's cell travels WHOLE, which is what carries its label: the label
      // rides the cell's bottom edge (.ha-door is justify-content:flex-end), so
      // a cell that moved its top alone would leave the label behind while the
      // shape went down.
      // Row 1 then gives up the same amount off its TOP rather than moving, so
      // the two cells still tile edge to edge with no overlap and row 1's own
      // shape and label do not budge. Without that, row 0's cell would overlap
      // row 1's, and row 1 wins a shared strip (it is later in the DOM), which
      // would quietly make row 0's labels unclickable.
      cellTopPct: grid
        ? (GRID_ROW[i] === 0 ? 50 - 2 * halfBand + dropPct : 50 + dropPct)
        : 50 - CELL_TOP_ROW * k,
      cellHeightPct: grid
        ? (GRID_ROW[i] === 0 ? 2 * halfBand : 2 * halfBand - dropPct)
        : CELL_H_ROW * k,
      cellWidthPct,
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

// THE SKY ARRIVES LATE.
//
// Measured 2026-07-31 on an Intel Iris Xe, through the break spiral, full bleed:
//   sky composing normally               p95 62.3ms
//   sky canvas present, composer skipped p95 55.3ms
//   sky canvas NOT MOUNTED               p95 41.8ms
// Drawing the sky costs about 7ms. The canvas merely EXISTING costs about 13.6,
// nearly twice as much, because the browser allocates that full-viewport layer
// and composites it every frame whether or not one pixel of it changed. An idle
// canvas is not a free canvas, and skipping its render only ever removed the
// smaller half of the bill. It has to come out of the tree.
//
// Nothing is lost by starting late. Both sky layers used to sit at EXACTLY zero
// opacity until 2.5 (Starfield 2.6), so the whole machine tunnel, warp core and
// streak section was paying for a completely transparent image. SKY_IN is now
// after BreakShards ends at 3.7, so the break spiral -- the beat that asks the
// most of the GPU -- has it to itself. The flood whites the frame out from 2.2
// to 3.0 anyway, so a sky fading up under it was never what was being watched.
export const SKY_IN = 4.25;
export const SKY_FULL = 6.0;

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

// What the wordmark settles AT. The driver writes this inline every frame, so
// this is the value that decides the look, and hero.css only mirrors it for the
// no-JS/settled path. Change both together or the settled frame will not match
// the animated one.
export const MARK_ALPHA = 0.05;
// The phone runs it as real type, not as a watermark. On mobile the wordmark is
// no longer BEHIND the tagline: it takes its own row above it (see the mobile
// block in hero.css), and nothing is layered over it there, so the watermark
// alpha that works on the desktop just leaves it invisible.
export const MARK_ALPHA_MOBILE = 0.75;
// One definition of "mobile" for the hero, because two would drift. The driver
// matchMedia()s this for the alpha above; the mobile block in hero.css repeats
// the same query for the layout. Deliberately width-only, unlike the dpr cap in
// HeroCanvas (which samples min(innerWidth, innerHeight) < 700): that form would
// also catch a short desktop window and restack the address on the desktop.
export const HERO_MOBILE_MQ = "(max-width: 700px)";

// THE WAY OUT. The homepage holds the scroll until the animatic has finished,
// so there has to be a way past it long before the menu lands, which is why
// this no longer rides the doors' clock. It arrives during THE PULL, dim, and
// comes up to full with the menu at 5.75. Half brightness during the intro so
// it is findable without sitting on top of the composition.
// Brought a full real-time second forward, which is HALF a unit here: the clock
// runs at rate 0.5 until story-t 2.0 (see ClockDriver), so one second on a watch
// is 0.5 of t during the intro. The control now shows about a fifth of a second
// in rather than 1.2s in. Both ends move together so the fade keeps its shape.
// Not screen-dependent, and deliberately so: this is the only way past the
// scroll lock, and how soon you can leave should not depend on the device.
export const ENTER_IN = 0.1;
export const ENTER_OUT = 0.8;
export const ENTER_DIM = 0.5;
// And it changes what it says. While the page is held the control is a SKIP;
// once the animatic has finished there is nothing left to skip and it goes back
// to being the way down into the page. The swap runs across the tail of THE
// NAME, from the wordmark settling (MARK_OUT, which is also where the lock
// lifts) to the end of the timeline, so the beat that was already sitting
// still is what carries it.

// THE VEIL. Black over the cosmos, tied to scroll position, fully on once the
// hero is one whole screen behind you.
export const VEIL_MAX = 0.5;

// How long the hero's own layers take to leave once the page scrolls off them,
// and to come back. The whole range, not a half-life. Shared: the scene eases
// on it, and the skip transition runs the veil in on the same clock so one
// gesture reads as one move.
export const FADE_SECS = 0.8;

// THE ABORT. How long the animatic takes to come to a close when SKIP is
// pressed. It does not have to outrun anything: the page is held still until
// this has finished and only then travels, which is the whole reason the
// indicator exists. Long enough to read as the piece closing, short enough that
// nobody is waiting on it.
export const SKIP_SECS = 0.45;

// The indicator that covers it. Up fast, because it has to be there before the
// animatic starts leaving; out slower, dissolving into the travel.
export const LOAD_IN = 0.18;
export const LOAD_OUT = 0.32;

// Where the clock is parked when there is no animatic to play: the line typed
// and the wordmark settled. Named rather than written as a literal at the one
// place that parks there, because "rested" is a real position in this timeline
// and a second copy of it would drift.
export const T_SETTLED = 11.4;
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
  // The scene outlives the hero on the homepage: the canvas is fixed to the
  // viewport so the cosmos stays behind the whole page while the feed scrolls
  // through it. `pastRef` is the target and `bloomFadeRef` the eased value, and
  // what they now govern is the BLOOM, which lights the starfield and is the
  // expensive pass: past the hero it eases off and switches out. They no longer
  // fade the hero's own geometry, because the hero's own geometry scrolls away
  // like everything else on the page (see the scroll rig in HeroCanvas) and a
  // thing that leaves the screen does not also need to dissolve.
  // Refs, not state, so scrolling never re-renders the canvas.
  pastRef: MutableRefObject<boolean>;
  bloomFadeRef: MutableRefObject<number>;
  // THE ABORT. `skipRef` is true from the moment SKIP is pressed until the page
  // has finished travelling, and `abortRef` is the eased value every hero-owned
  // layer multiplies its opacity by. This is the only thing that dissolves the
  // hero now, and it exists because ending the animatic early is a different
  // event from scrolling past it.
  skipRef: MutableRefObject<boolean>;
  abortRef: MutableRefObject<number>;
}

// DOM nodes the in-canvas HUD driver writes to each frame.
export interface HeroHud {
  beatRef: MutableRefObject<HTMLElement | null>;
  tcRef: MutableRefObject<HTMLElement | null>;
  floodRef: MutableRefObject<HTMLDivElement | null>;
  doorsRef: MutableRefObject<HTMLDivElement | null>;
  // The way out, on its own clock rather than the menu's: it is the release
  // valve for the scroll lock, so it cannot wait for the doors to land.
  enterRef: MutableRefObject<HTMLAnchorElement | null>;
  // Both are headings on the page now: h1 wordmark, h2 tagline.
  titleRef: MutableRefObject<HTMLHeadingElement | null>;
  markRef: MutableRefObject<HTMLHeadingElement | null>;
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
