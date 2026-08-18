"use client";

/* Transcend the Machine - Phase 1 core engine + Phase 2 L1 vertical slice.
 *
 * Engine (Phase 1): UnrealBloom phosphor pass, glitch art panels riding the
 * wireframe, real beat_data pulse (kick -> pillars, snare -> rune, bass-synth
 * -> grid, bass-pulse -> void bloom), AABB collision, level-loader scaffold +
 * HUD shell.
 *
 * L1 "Machine" slice (Phase 2): wake in a corridor that LOOPS - fly forward and
 * the pillars stream past but you never advance (the 9-5 treadmill), and a wall
 * hovers identical and unreachable ahead. You don't outrun it: you strike it.
 * Hold the strike key to charge; at full charge the wall shatters into vector
 * shards, the treadmill stops, and the exit was always there - fly into the
 * light to transcend. NOTE: the strike INPUT (hold Space) is a placeholder
 * pending the final keyboard/typing verb-input design; the mechanic is built.
 *
 * Controls (keyboard only): W/S or up/down move, A/D strafe, left/right turn
 * (zero momentum), Q/E fly, Space strike (L1), 1-5 load levels, Enter continue.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  buildColliders,
  buildComfortCollider,
  buildEscapeColliders,
  buildEscapeWalls,
  buildGateColliders,
  buildLegGateColliders,
  buildPillars,
  buildSignal,
  buildSirens,
  COMFORT_HALF_W,
  COMFORT_TOP,
  CORRIDOR_HW,
  EYE_HEIGHT,
  FLOOR_Y,
  GATE_AISLE,
  GATE_HWZ,
  GATE_TOP,
  L1_COMFORT_DZ,
  L1_GAUNTLET,
  L1_LEG_GATES,
  L1_LEG_W,
  L1_TURN_DZ,
  LEG_GATE_BLOCK_Z,
  l1ExitPos,
  FOG_DENSITY,
  levelById,
  LEVELS,
  mulberry32,
  ridePathX,
  RIDE_END,
  RUNE_Z,
  startPhaseFor,
  WALL_AHEAD,
  WALL_HEIGHT,
  WALL_WIDTH,
  WRAP_LEN,
  type Collider,
  type JourneyGate,
  type LevelConfig,
  type Phase,
  type WallSeg,
  type Pillar,
  type Pulse,
  type ReactiveData,
  type Signal,
  type Siren,
} from "./levels";
import { makePillarSkinMaterial } from "./pillarSkinMaterial";
import { BloomComposer } from "./BloomComposer";
import posthog from "posthog-js";
import { analyticsAllowed } from "@/lib/consent";
import "./transcend.css";

// Consent-gated PostHog capture (mirrors PlayerContext). All game funnel events
// are namespaced tm_* so the Transcend the Machine funnel is filterable.
function track(event: string, props?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  try {
    if (analyticsAllowed()) posthog.capture(event, props);
  } catch {
    /* PostHog uninitialized / consent declined - no-op */
  }
}

// Levels 1-2 are free; 3-5 require a free account (the create-account gate).
const FREE_LEVELS = 5; // TEMP-UNLOCK: restore to 2 before commit/push
// TEMP-UNLOCK: always start on L1 for the walkthrough instead of resuming into
// the furthest saved level. Restore to false with the rest of TEMP-UNLOCK.
const TEMP_START_L1 = true;

// L5 climax: ask the server for Opus's reflection on a typed truth. The route
// already returns its own static line on a model error, so this fetch resolves
// to a reflection in the normal case. These client fallbacks only cover the
// fetch itself failing (network / abort), so the dissolve never hard-blocks.
const CLIMAX_FALLBACK = [
  "That is yours to decide now, not theirs.",
  "Their watching stops mattering the second you stop performing.",
  "No one outside you gets to hand down the verdict.",
  "That name was assigned, not chosen. You author the next one.",
  "Nothing out there was ever the thing you needed.",
];
const CLIMAX_FINAL_FALLBACK = "The way out was your own voice. You wrote it.";

// Anon-play continuity: a stable client id kept in localStorage, sent with
// progress saves so an anon player's run survives a reload (and can carry into
// their account if they sign up later).
function getTmSessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = window.localStorage.getItem("tm_session");
    if (!id) {
      id = window.crypto?.randomUUID?.() ?? `tm_${Date.now().toString(36)}${Math.floor(Math.random() * 1e9).toString(36)}`;
      window.localStorage.setItem("tm_session", id);
    }
    return id;
  } catch {
    return "";
  }
}

// Fire-and-forget progress save (furthest level + inventory). Failures are
// swallowed - persistence never blocks play.
function postTmProgress(sessionId: string, currentLevel: number, inventory: { key: boolean; rune: boolean }) {
  fetch("/api/transcend/progress", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, currentLevel, inventory }),
    keepalive: true,
  }).catch(() => {});
}

// Journey complete (L5 transcended): marks completion, grants the merch coupon
// to a signed-in player, logs the pixel-wall event. Resolves to the route's
// result (or null on failure) so the completion card can note the reward.
async function postTmComplete(sessionId: string): Promise<{ alreadyCompleted?: boolean; couponCode?: string | null } | null> {
  try {
    const res = await fetch("/api/transcend/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
      keepalive: true,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchClimaxReflection(args: {
  level: number;
  layer: string | null;
  truth: string;
  index: number;
  priorTruths: string[];
}): Promise<string> {
  // L5 has 5 layers (index 0..4); the last one is the synthesis.
  const isFinal = args.index >= 4;
  const fallback = isFinal ? CLIMAX_FINAL_FALLBACK : CLIMAX_FALLBACK[args.index] ?? CLIMAX_FALLBACK[0];
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12_000);
    const res = await fetch("/api/transcend/climax", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return fallback;
    const json = await res.json();
    return typeof json?.reflection === "string" && json.reflection.trim() ? json.reflection : fallback;
  } catch {
    return fallback;
  }
}

const CYAN = "#00e0ff";
const MIN_Y = FLOOR_Y + EYE_HEIGHT;

// Controller feel
const ACCEL = 100; // thrust per second
const MAX_SPEED = 34;
const DAMP_PER_SEC = 3e-5; // velocity fraction retained per second (snappy stop)
const TURN_RATE = 1.8; // rad/sec while a turn key is held
const PLAYER_RADIUS = 1.1;

// "The Field" - the invisible boundary box enclosing the walkable area, applied
// only on levels that actually have columns (treadmill / facade / collect). Its
// LEFT/RIGHT/FRONT faces snap to the columns' rear faces (outer faces, away from
// the aisle), derived per level from the pillar footprints - see fieldBounds().
// The BACK face sits behind spawn and the ceiling above the tallest column. All
// built mechanic targets sit well inside the Field (collect signals reach
// ~z -86, the ride ends at -150, exit portals land by ~-145), so it never
// fights a mechanic. Running into a face fires a discovery shock at the contact
// point: radial lightning + a glitch panel revealing the wall.
const BOUND_Y_TOP = FLOOR_Y + 34; // ceiling above the tallest column
const BOUND_Z_NEAR = 22; // back face, just behind the spawn (z = 16)
const BOUND_SHOCK_COOLDOWN = 0.4; // min seconds between shocks on a held push
// The eye stops this far short of a face so you never merge into the wall. It
// exceeds the wall's inward bulge (2.4) so even a peak bulge stays ahead of you.
const FIELD_STANDOFF = 3.2;

// The Field's derived extent for a level: lateral half-width + the far (front)
// face, both pulled from the columns' rear faces.
type FieldBounds = { x: number; zFar: number };
function fieldBounds(colliders: Collider[]): FieldBounds | null {
  if (colliders.length === 0) return null;
  let x = 0;
  let zFar = 0;
  for (const c of colliders) {
    x = Math.max(x, Math.abs(c.x) + c.hwx); // outer (rear) face on the sides
    zFar = Math.min(zFar, c.z - c.hwz); // rear face of the deepest row
  }
  return { x, zFar };
}

// A Field contact, written by the controller and read by the FieldWall whose
// face matches. The point (x,y,z) is the world contact on that face; the wall
// ripples outward from it. seq rises on each fresh hit (rising edge /
// post-cooldown) so the ripple restarts.
type FieldFace = "left" | "right" | "front" | "back";
type BoundaryHit = { seq: number; x: number; y: number; z: number; face: FieldFace };

// beat_data dispatch thresholds (mirrors the visualizer's stem profile)
const KICK_THRESH = 0.32;
const KICK_FLOOR = 0.55;
const KICK_RANGE = 0.55;
const SNARE_THRESH = 0.15;
const SNARE_FLOOR = 0.55;
const SNARE_RANGE = 0.5;
const TOM_THRESH = 0.2; // full-kit groove -> subtle whole-corridor shake
const CLAP_THRESH = 0.25; // clap accent -> a particle burst on the rising edge
const BASS_PULSE_THRESH = 0.2;
const SLOP = 0.05;

// L1 vertical-slice tuning
const WRAP_HI = 16; // treadmill keeps the player in [WRAP_HI - WRAP_LEN, WRAP_HI]
const SHATTER_DUR = 0.9; // shatter animation length
const PORTAL_BEYOND = 35; // exit portal sits this far beyond the broken wall
const PORTAL_REACH = 6; // distance to the portal that completes the level
const COMFORT_PROMPT_RANGE = 14; // the comfort wall speaks up once you're this close
// Cursor scrim: the cursor is hidden inside this central ellipse and reveals
// itself once the pointer crosses out toward the viewport edges (a cursor hidden
// everywhere is disorienting). Radii as fractions of the viewport half-extents.
const CURSOR_SCRIM_RX = 0.62;
const CURSOR_SCRIM_RY = 0.62;
// Each level's accepted words live in its config (level.word.accept). A hint
// unlocks only after this many wrong guesses.
const HINT_AFTER_TRIES = 3;
// L3 collect tuning
const COLLECT_REACH = 3.2; // fly this close to gather a signal fragment
const COLLECT_EXIT_Z = 110; // the exit opens here once the key is assembled
// L4 ride tuning
const RIDE_DRIFT_ACCEL = 2.2; // sideways pull off the ribbon (the sirens' hold)
const RIDE_DRIFT_MAX = 14; // |offset| at which you are fully "pulled" (HUD)
const RIDE_SPEED = 24; // the wave carries you forward at this min speed (you steer)

type GameState = {
  struck: boolean;
  reached: boolean;
  tension: number;
  strikeRequested: boolean;
  collected: boolean[]; // per-fragment gathered flag (L3)
  collectedCount: number;
  keyDone: boolean; // all fragments gathered -> key assembled
  drift: number; // 0..1 distance off the L4 waveform (HUD)
  lockedHit: boolean; // reached the L4 door without the key
  egoDissolved: number; // L5 programming layers dissolved
};
type BreakInfo = { wallZ: number; portalZ: number; portalX?: number };
type Inventory = { key: boolean; rune: boolean };

// ---------------------------------------------------------------------------
// The false wall - pinned ahead through the whole treadmill, same glitch skin
// as the pillars so it "looks identical to the rest". Destabilizes as you
// charge the strike.
// ---------------------------------------------------------------------------
function FalseWall({ hue, gameRef }: { hue: string; gameRef: React.MutableRefObject<GameState> }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const geo = useMemo(() => new THREE.BoxGeometry(WALL_WIDTH, WALL_HEIGHT, 0.6), []);
  const mat = useMemo(
    () =>
      makePillarSkinMaterial({
        seed: 3.3,
        glitchId: 2,
        tint: new THREE.Color(hue),
        texture: null,
        hasTexture: false,
        fogDensity: FOG_DENSITY,
      }),
    [hue],
  );
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);

  useFrame((state, delta) => {
    const m = meshRef.current;
    if (!m) return;
    m.position.set(0, FLOOR_Y + WALL_HEIGHT / 2, state.camera.position.z - WALL_AHEAD);
    const g = gameRef.current;
    g.tension = Math.max(0, g.tension - Math.min(delta, 0.05) * 1.4); // settle
    const u = (m.material as THREE.ShaderMaterial).uniforms;
    u.uTime.value = state.clock.elapsedTime;
    u.uGlitch.value = 0.2 + g.tension * 0.7; // destabilizes as you type / on a wrong word
    u.uBeat.value = g.tension * 0.5;
  });

  return <mesh ref={meshRef} geometry={geo} material={mat} />;
}

// ---------------------------------------------------------------------------
// The facade (L2 "See Through Me"): a clean glossy front pinned ahead - the
// opposite read of L1's glitch wall. It says you're fine; the path is behind
// it. It flickers when you push (tension), and breaks into debt-red shards.
// ---------------------------------------------------------------------------
function Facade({ hue, gameRef }: { hue: string; gameRef: React.MutableRefObject<GameState> }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const geo = useMemo(() => new THREE.BoxGeometry(WALL_WIDTH, WALL_HEIGHT, 0.6), []);
  const mat = useMemo(() => {
    // A clean, glossy green-white front - bright enough to bloom, not a pure
    // white blowout (it is a facade you keep up, not a wall of light).
    const c = new THREE.Color(hue).lerp(new THREE.Color("#ffffff"), 0.22);
    return new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.82, fog: true });
  }, [hue]);
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);

  useFrame((state, delta) => {
    const m = meshRef.current;
    if (!m) return;
    m.position.set(0, FLOOR_Y + WALL_HEIGHT / 2, state.camera.position.z - WALL_AHEAD);
    const g = gameRef.current;
    g.tension = Math.max(0, g.tension - Math.min(delta, 0.05) * 1.4);
    // Glossy sheen breath; flickers when you push the front (tension high).
    const sheen = 0.78 + 0.06 * Math.sin(state.clock.elapsedTime * 2.0);
    const flick = g.tension > 0.5 && Math.sin(state.clock.elapsedTime * 42) < 0 ? 0.5 : 1;
    (m.material as THREE.MeshBasicMaterial).opacity = sheen * flick;
  });

  return <mesh ref={meshRef} geometry={geo} material={mat} />;
}

// ---------------------------------------------------------------------------
// Shatter: the blocker bursts into vector shards that fly out, tumble, and
// shrink away. Calls onDone after SHATTER_DUR so the level can reveal the exit.
// ---------------------------------------------------------------------------
function Shatter({ color, wallZ, onDone }: { color: string; wallZ: number; onDone: () => void }) {
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), []);
  const mat = useMemo(
    () => new THREE.LineBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }),
    [color],
  );
  useEffect(() => () => { edges.dispose(); mat.dispose(); }, [edges, mat]);

  // Deterministic initial spread (react-hooks/purity forbids Math.random in
  // render). The mutable per-frame sim lives in a ref so the integration loop
  // does not modify a hook value (react-hooks/immutability).
  const SHARD_COUNT = 64;
  const initial = useMemo(() => {
    const rnd = mulberry32(Math.floor(Math.abs(wallZ) * 131) + 7);
    return Array.from({ length: SHARD_COUNT }, () => ({
      px: (rnd() - 0.5) * WALL_WIDTH,
      py: FLOOR_Y + rnd() * WALL_HEIGHT,
      pz: wallZ + (rnd() - 0.5) * 1.4,
      vx: (rnd() - 0.5) * 13,
      vy: (rnd() - 0.12) * 10,
      vz: (rnd() - 0.5) * 8,
      rx: rnd() * 6, ry: rnd() * 6, rz: rnd() * 6,
      rvx: (rnd() - 0.5) * 9, rvy: (rnd() - 0.5) * 9, rvz: (rnd() - 0.5) * 9,
      // Irregular slivers (non-uniform per axis), not uniform cubes - finer,
      // more glass-like debris than a few chunky boxes.
      sx: 0.16 + rnd() * 0.95,
      sy: 0.16 + rnd() * 1.5,
      sz: 0.08 + rnd() * 0.45,
    }));
  }, [wallZ]);
  const refs = useRef<(THREE.LineSegments | null)[]>([]);
  const simRef = useRef<(typeof initial) | null>(null);
  const start = useRef(-1);
  const done = useRef(false);

  useFrame((state, delta) => {
    if (!simRef.current) simRef.current = initial.map((s) => ({ ...s }));
    const sim = simRef.current;
    if (start.current < 0) start.current = state.clock.elapsedTime;
    const t = state.clock.elapsedTime - start.current;
    const dt = Math.min(delta, 0.05);
    const fade = Math.max(0, 1 - t / SHATTER_DUR);
    for (let i = 0; i < sim.length; i++) {
      const m = refs.current[i];
      const s = sim[i];
      if (!m) continue;
      s.vy -= 9 * dt; // gravity
      s.px += s.vx * dt;
      s.py += s.vy * dt;
      s.pz += s.vz * dt;
      m.position.set(s.px, s.py, s.pz);
      m.rotation.set(s.rx + s.rvx * t, s.ry + s.rvy * t, s.rz + s.rvz * t);
      m.scale.set(s.sx * fade, s.sy * fade, s.sz * fade);
    }
    if (t >= SHATTER_DUR && !done.current) {
      done.current = true;
      onDone();
    }
  });

  return (
    <group>
      {initial.map((_, i) => (
        <lineSegments key={i} ref={(el) => { refs.current[i] = el; }} geometry={edges} material={mat} />
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Exit portal: the rune that was always there. A hot white core (blooms into a
// light flood as you approach) inside a hue ring.
// ---------------------------------------------------------------------------
function ExitPortal({ hue, portalZ, x = 0 }: { hue: string; portalZ: number; x?: number }) {
  const ringRef = useRef<THREE.LineSegments>(null);
  const coreRef = useRef<THREE.LineSegments>(null);
  const ring = useMemo(() => new THREE.EdgesGeometry(new THREE.TorusGeometry(4.6, 0.5, 8, 26)), []);
  const core = useMemo(() => new THREE.EdgesGeometry(new THREE.OctahedronGeometry(2.2, 0)), []);
  const ringMat = useMemo(
    () => new THREE.LineBasicMaterial({ color: new THREE.Color(hue), transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }),
    [hue],
  );
  const coreMat = useMemo(
    () => new THREE.LineBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
    [],
  );
  useEffect(() => () => { ring.dispose(); core.dispose(); ringMat.dispose(); coreMat.dispose(); }, [ring, core, ringMat, coreMat]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    if (coreRef.current) {
      coreRef.current.rotation.y += dt * 1.3;
      coreRef.current.rotation.x += dt * 0.7;
    }
    if (ringRef.current) ringRef.current.rotation.z += dt * 0.5;
  });

  return (
    <group position={[x, 1.5, portalZ]}>
      <lineSegments ref={ringRef} geometry={ring} material={ringMat} />
      <lineSegments ref={coreRef} geometry={core} material={coreMat} />
    </group>
  );
}

// ---------------------------------------------------------------------------
// The waveform ribbon (L4 "Everything I Need"): a swaying centerline with
// vertical waveform ticks, stretching into the void. You ride it; the sirens
// pull you off. (Procedural waveform; per-song beat_data would shape it later.)
// ---------------------------------------------------------------------------
function WaveformRibbon({ hue }: { hue: string }) {
  const geo = useMemo(() => {
    const pts: number[] = [];
    const STEP = 2;
    let prevX = ridePathX(0);
    let prevZ = 0;
    for (let z = -STEP; z >= -RIDE_END; z -= STEP) {
      const x = ridePathX(z);
      pts.push(prevX, 0, prevZ, x, 0, z); // centerline segment
      prevX = x;
      prevZ = z;
      const amp = 1.2 + 1.8 * Math.abs(Math.sin(z * 0.5)); // waveform tick height
      pts.push(x, -amp, z, x, amp, z);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, []);
  const mat = useMemo(
    () => new THREE.LineBasicMaterial({ color: new THREE.Color(hue), transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }),
    [hue],
  );
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);
  return <lineSegments geometry={geo} material={mat} />;
}

// A gravity-siren (L4): a pulsing orb off to the side of the ribbon - the
// substance, the toxic partner - that drags you off course.
function SirenOrb({ x, z, color }: { x: number; z: number; color: string }) {
  const ref = useRef<THREE.LineSegments>(null);
  const geo = useMemo(() => new THREE.EdgesGeometry(new THREE.OctahedronGeometry(2.2, 1)), []);
  const mat = useMemo(
    () => new THREE.LineBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
    [color],
  );
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);
  useFrame((state) => {
    const m = ref.current;
    if (!m) return;
    m.rotation.y += 0.01;
    m.scale.setScalar(1 + 0.25 * Math.sin(state.clock.elapsedTime * 3 + x));
  });
  return <lineSegments ref={ref} geometry={geo} material={mat} position={[x, 0, z]} />;
}

// ---------------------------------------------------------------------------
// L5 "Finding Freedom": the mirror-self ringed by programming layers. Type
// your own truths to dissolve the rings (outer list order), then the rune
// matches. One programming ring; "active" = the next one you're confronting.
// ---------------------------------------------------------------------------
function EgoRing({ radius, tilt, color, active }: { radius: number; tilt: number; color: string; active: boolean }) {
  const ref = useRef<THREE.LineSegments>(null);
  const geo = useMemo(() => new THREE.EdgesGeometry(new THREE.TorusGeometry(radius, 0.25, 6, 40)), [radius]);
  const mat = useMemo(
    () => new THREE.LineBasicMaterial({ color: new THREE.Color(active ? "#ff2e63" : color), transparent: true, opacity: active ? 0.95 : 0.5, blending: THREE.AdditiveBlending, depthWrite: false }),
    [color, active],
  );
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);
  useFrame((_, delta) => {
    const m = ref.current;
    if (m) m.rotation.z += Math.min(delta, 0.05) * (active ? 0.8 : 0.3);
  });
  return <lineSegments ref={ref} geometry={geo} material={mat} rotation={[tilt, tilt * 0.7, 0]} />;
}

function EgoArena({ hue, dissolved, total }: { hue: string; dissolved: number; total: number }) {
  const selfRef = useRef<THREE.LineSegments>(null);
  const geo = useMemo(() => new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(5, 1)), []);
  const mat = useMemo(
    () => new THREE.LineBasicMaterial({ color: new THREE.Color(hue), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
    [hue],
  );
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);
  useFrame((state) => {
    const m = selfRef.current;
    if (!m) return;
    m.rotation.y += 0.004;
    m.rotation.x += 0.002;
    (m.material as THREE.LineBasicMaterial).opacity = 0.55 + 0.3 * Math.abs(Math.sin(state.clock.elapsedTime * 3)); // the self glitches
  });
  const rings = [];
  for (let i = dissolved; i < total; i++) {
    rings.push(<EgoRing key={i} radius={8 + i * 2} tilt={0.4 + i * 0.5} color={hue} active={i === dissolved} />);
  }
  return (
    <group position={[0, 1.5, -30]}>
      <lineSegments ref={selfRef} geometry={geo} material={mat} />
      {rings}
    </group>
  );
}

// ---------------------------------------------------------------------------
// A signal fragment (L3 "I Got The Key"): a glowing shard you fly into to
// gather. Spins + bobs so it reads as live signal amid the doomscroll.
// ---------------------------------------------------------------------------
function SignalFragment({ x, y, z, color }: { x: number; y: number; z: number; color: string }) {
  const ref = useRef<THREE.LineSegments>(null);
  const geo = useMemo(() => new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(0.9, 0)), []);
  const mat = useMemo(
    () => new THREE.LineBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
    [color],
  );
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);
  useFrame((state, delta) => {
    const m = ref.current;
    if (!m) return;
    m.rotation.y += delta * 1.7;
    m.rotation.x += delta * 0.9;
    m.position.y = y + Math.sin(state.clock.elapsedTime * 2 + x) * 0.4;
  });
  return <lineSegments ref={ref} geometry={geo} material={mat} position={[x, y, z]} />;
}

// Sample a continuous synth envelope (chord / warp) at the current audio time.
// Linear-interpolated between frames; 0 outside the captured range. Same math
// as the bass-synth follower.
function sampleEnv(ch: { env: number[]; hz: number } | undefined, t: number, off: number): number {
  if (!ch || !ch.hz || ch.env.length === 0) return 0;
  const fIdx = (t - off) * ch.hz;
  const i0 = Math.floor(fIdx);
  if (i0 < 0 || i0 >= ch.env.length) return 0;
  const a = ch.env[i0];
  const b = ch.env[i0 + 1] ?? a;
  return a * (1 - (fIdx - i0)) + b * (fIdx - i0);
}

// Scratch vectors for the particle burst (avoid per-frame allocation).
const _camPos = new THREE.Vector3();
const _camDir = new THREE.Vector3();
const _origin = new THREE.Vector3();

// ClapBurst: a pool of glowing vector sparks that puff outward on each clap.
// The clap stem (least dense kit piece) writes pulse.clap; a rising edge fires
// one burst from a point just ahead of the camera so it lands in view wherever
// the player is looking. Additive + bloom-lit. Inert (opacity 0) on levels
// whose songs carry no clap data, so it is safe to always mount. Lives in world
// space, OUTSIDE the swaying scene group, so the sparks are not double-shaken.
const BURST_N = 72;
const BURST_LIFE = 0.6; // seconds a burst lives
const BURST_TRIGGER = 0.5; // pulse.clap rising-edge level that fires a burst
function ClapBurst({ hue, pulseRef }: { hue: string; pulseRef: React.MutableRefObject<Pulse> }) {
  const pointsRef = useRef<THREE.Points>(null);
  const life = useRef(0);
  const prevClap = useRef(0);
  const vel = useRef(new Float32Array(BURST_N * 3));

  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(BURST_N * 3), 3));
    return g;
  }, []);
  const mat = useMemo(
    () =>
      new THREE.PointsMaterial({
        color: new THREE.Color(hue),
        size: 0.42,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [hue],
  );
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);

  useFrame((state, delta) => {
    const pts = pointsRef.current;
    if (!pts) return;
    const dt = Math.min(delta, 0.05);
    const clap = pulseRef.current.clap;
    const pos = geo.attributes.position.array as Float32Array;
    const v = vel.current;

    // Rising edge -> (re)spawn the whole pool ahead of the camera.
    if (clap >= BURST_TRIGGER && prevClap.current < BURST_TRIGGER) {
      state.camera.getWorldDirection(_camDir);
      _camPos.copy(state.camera.position);
      _origin.copy(_camPos).addScaledVector(_camDir, 5); // 5u into the view
      for (let i = 0; i < BURST_N; i++) {
        const i3 = i * 3;
        // small random sphere around the origin so they don't all stack
        const rx = (((i * 7 + 3) % 13) / 13 - 0.5) * 1.2;
        const ry = (((i * 5 + 1) % 11) / 11 - 0.5) * 1.2;
        const rz = (((i * 11 + 6) % 17) / 17 - 0.5) * 1.2;
        pos[i3] = _origin.x + rx;
        pos[i3 + 1] = _origin.y + ry;
        pos[i3 + 2] = _origin.z + rz;
        // outward velocity: deterministic pseudo-random direction * speed
        const a1 = (i * 2.39996323) % (Math.PI * 2); // golden-angle spray
        const a2 = ((i * 1.61803399) % 1) * Math.PI - Math.PI / 2;
        const speed = 3 + ((i * 13) % 7) * 0.6;
        v[i3] = Math.cos(a1) * Math.cos(a2) * speed;
        v[i3 + 1] = Math.sin(a2) * speed + 1.2; // slight upward lift
        v[i3 + 2] = Math.sin(a1) * Math.cos(a2) * speed;
      }
      life.current = 1;
    }
    prevClap.current = clap;

    if (life.current > 0) {
      life.current -= dt / BURST_LIFE;
      const drag = Math.pow(0.12, dt); // velocity damping
      for (let i = 0; i < BURST_N; i++) {
        const i3 = i * 3;
        pos[i3] += v[i3] * dt;
        pos[i3 + 1] += v[i3 + 1] * dt;
        pos[i3 + 2] += v[i3 + 2] * dt;
        v[i3] *= drag;
        v[i3 + 1] = v[i3 + 1] * drag - 4 * dt; // gravity sag
        v[i3 + 2] *= drag;
      }
      geo.attributes.position.needsUpdate = true;
      const l = Math.max(0, life.current);
      mat.opacity = l * l; // ease-out fade
      mat.size = 0.18 + 0.34 * l;
    } else if (mat.opacity !== 0) {
      mat.opacity = 0;
    }
  });

  return <points ref={pointsRef} geometry={geo} material={mat} frustumCulled={false} />;
}

// The Field walls: real forcefield planes that exist in world space at the
// boundary faces (left / right / front / back), aligned to the columns' rear
// faces. Baseline is a barely-there energy grid - a laser-barrier you can just
// sense. When something touches a face, THAT wall ripples a bright ring outward
// from the exact world contact point and fades, like a sci-fi cell reacting to
// the touch. The effect lives on the wall, not on the player.
const FIELD_VERT = `
  varying vec3 vWorldPos;
  uniform vec3 uHit;
  uniform vec3 uNormalDir; // inward (toward the play area)
  uniform float uTime;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz; // undisplaced - keeps the grid anchored in the fragment
    // The wall bulges inward where the pulse is, so the touch is visible even
    // when you are pressed flat against the face (a forcefield taking a hit).
    // Tight + concentrated near the exact contact, not a wide wash.
    float d = distance(wp.xyz, uHit);
    float front = uTime * 9.0;
    float band = smoothstep(1.6, 0.0, abs(d - front));
    float core = smoothstep(3.0, 0.0, d) * clamp(1.0 - uTime / 0.18, 0.0, 1.0);
    float life = clamp(1.0 - uTime / 0.6, 0.0, 1.0);
    float bulge = (band + core) * life;
    wp.xyz += uNormalDir * bulge * 2.4;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const FIELD_FRAG = `
  precision highp float;
  varying vec3 vWorldPos;
  uniform vec3 uHit;     // world contact point of the last touch
  uniform vec3 uTangent; // wall's horizontal in-plane axis (for the grid)
  uniform vec3 uColor;
  uniform float uTime;   // seconds since the last touch (large = quiescent)
  void main() {
    // The wall is fully invisible at rest. Only the touch renders it, and only
    // in a tight, detailed bloom at the exact contact point: a fine grid
    // structure lit by a narrow ring with radial filaments and a bright core
    // that blooms where you hit, then gone.
    float horiz = dot(vWorldPos, uTangent);
    float vert = vWorldPos.y;
    vec2 gg = abs(fract(vec2(horiz, vert) / 1.6) - 0.5); // finer cells = more detail
    float gridLine = smoothstep(0.42, 0.5, max(gg.x, gg.y));
    float structure = mix(0.18, 1.0, gridLine);

    // Local 2D frame on the wall, centred on the contact, for radial detail.
    float ax = horiz - dot(uHit, uTangent);
    float ay = vert - uHit.y;
    float d = length(vec2(ax, ay));
    float ang = atan(ay, ax);

    float front = uTime * 9.0;                               // slow -> stays small
    float ring = smoothstep(1.6, 0.0, abs(d - front));       // narrow wavefront
    float spokes = 0.5 + 0.5 * sin(ang * 18.0 + uTime * 28.0); // radial filaments
    float crackle = 0.6 + 0.4 * sin(d * 9.0 - uTime * 60.0);   // electric shimmer
    float filaments = ring * mix(0.35, 1.0, spokes) * crackle;
    float core = smoothstep(3.0, 0.0, d) * clamp(1.0 - uTime / 0.18, 0.0, 1.0); // bloom point
    float life = clamp(1.0 - uTime / 0.6, 0.0, 1.0);
    float pulse = (filaments + core * 1.5) * life;

    float a = pulse * structure + core * life * 0.7;         // core blooms even off-grid
    if (a < 0.012) discard;                                  // invisible everywhere else
    vec3 col = uColor * (0.9 + pulse * 2.2);
    gl_FragColor = vec4(col, a);
  }
`;

type WallDef = {
  face: FieldFace;
  pos: [number, number, number];
  rotY: number;
  w: number;
  h: number;
  tangent: [number, number, number];
  normal: [number, number, number]; // inward, toward the play area
};

function FieldWall({
  def,
  hue,
  boundaryRef,
}: {
  def: WallDef;
  hue: string;
  boundaryRef: React.MutableRefObject<BoundaryHit>;
}) {
  const seen = useRef(0);
  const hitClock = useRef(999); // large -> quiescent until the first touch
  const geo = useMemo(
    () =>
      new THREE.PlaneGeometry(
        def.w,
        def.h,
        Math.max(8, Math.round(def.w / 3)),
        Math.max(8, Math.round(def.h / 3))
      ),
    [def.w, def.h]
  );
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: FIELD_VERT,
        fragmentShader: FIELD_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: {
          uHit: { value: new THREE.Vector3() },
          uTangent: { value: new THREE.Vector3(...def.tangent) },
          uNormalDir: { value: new THREE.Vector3(...def.normal) },
          uColor: { value: new THREE.Color(hue) },
          uTime: { value: 999 },
        },
      }),
    [def.tangent, def.normal, hue]
  );
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);
  useEffect(() => { (mat.uniforms.uColor.value as THREE.Color).set(hue); }, [hue, mat]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const b = boundaryRef.current;
    if (b.seq !== seen.current) {
      seen.current = b.seq;
      if (b.face === def.face) {
        (mat.uniforms.uHit.value as THREE.Vector3).set(b.x, b.y, b.z);
        hitClock.current = 0;
      }
    }
    if (hitClock.current < 0.65) {
      hitClock.current += dt;
      mat.uniforms.uTime.value = hitClock.current;
    } else if (mat.uniforms.uTime.value !== 999) {
      mat.uniforms.uTime.value = 999;
    }
  });

  return (
    <mesh
      geometry={geo}
      material={mat}
      position={def.pos}
      rotation={[0, def.rotY, 0]}
      frustumCulled={false}
    />
  );
}

function FieldWalls({
  field,
  hue,
  boundaryRef,
}: {
  field: FieldBounds | null;
  hue: string;
  boundaryRef: React.MutableRefObject<BoundaryHit>;
}) {
  const defs = useMemo<WallDef[]>(() => {
    if (!field) return [];
    const yBot = FLOOR_Y;
    const yTop = BOUND_Y_TOP;
    const h = yTop - yBot;
    const cy = (yBot + yTop) / 2;
    const zNear = BOUND_Z_NEAR;
    const zFar = field.zFar;
    const len = zNear - zFar;
    const cz = (zNear + zFar) / 2;
    const x = field.x;
    return [
      { face: "right", pos: [x, cy, cz], rotY: Math.PI / 2, w: len, h, tangent: [0, 0, 1], normal: [-1, 0, 0] },
      { face: "left", pos: [-x, cy, cz], rotY: Math.PI / 2, w: len, h, tangent: [0, 0, 1], normal: [1, 0, 0] },
      { face: "front", pos: [0, cy, zFar], rotY: 0, w: x * 2, h, tangent: [1, 0, 0], normal: [0, 0, 1] },
      { face: "back", pos: [0, cy, zNear], rotY: 0, w: x * 2, h, tangent: [1, 0, 0], normal: [0, 0, -1] },
    ];
  }, [field]);
  if (!field) return null;
  return (
    <>
      {defs.map((d) => (
        <FieldWall key={d.face} def={d} hue={hue} boundaryRef={boundaryRef} />
      ))}
    </>
  );
}

// Floor: a grid that dissolves smoothly into the dark with camera distance
// (alpha falloff), instead of fogging to a hard horizon band that cut across
// the level assets. Breathes on the bass synth, like the old grid did.
const FLOOR_VERT = `
  varying vec3 vWorldPos;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const FLOOR_FRAG = `
  precision highp float;
  varying vec3 vWorldPos;
  uniform vec3 uColor;
  uniform float uOpacity;
  void main() {
    vec2 c = abs(fract(vWorldPos.xz / 5.0) - 0.5);
    float line = smoothstep(0.47, 0.5, max(c.x, c.y));
    float dist = distance(vWorldPos, cameraPosition);
    float fade = 1.0 - smoothstep(40.0, 100.0, dist); // gone before the horizon
    float a = line * fade * uOpacity;
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor, a);
  }
`;
function FloorGrid({ pulseRef }: { pulseRef: React.MutableRefObject<Pulse> }) {
  const geo = useMemo(() => new THREE.PlaneGeometry(800, 800, 1, 1), []);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: FLOOR_VERT,
        fragmentShader: FLOOR_FRAG,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uColor: { value: new THREE.Color("#0e5563") },
          uOpacity: { value: 0.4 },
        },
      }),
    []
  );
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);
  useFrame(() => {
    mat.uniforms.uOpacity.value = 0.18 + 0.5 * pulseRef.current.bass; // bass breathe
  });
  return (
    <mesh
      geometry={geo}
      material={mat}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, FLOOR_Y, -90]}
      frustumCulled={false}
    />
  );
}

// A gate's name (ALARM, COMMUTE, ...) burned onto its face as glowing phosphor
// text so the slalom reads as the 9-5 grind you weave through. Canvas-texture on
// a plane (no font deps); tinted to the gate hue, faces the approach (+z).
const LABEL_WORLD_Y = FLOOR_Y + 4; // eye-level on the gate (the player flies at ~y0)
function GateLabel({ text, localPos, mirror = false, hue }: { text: string; localPos: [number, number, number]; mirror?: boolean; hue: string }) {
  const tex = useMemo(() => {
    if (typeof document === "undefined") return null;
    const c = document.createElement("canvas");
    c.width = 320;
    c.height = 64;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.font = "bold 40px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(text, 160, 34);
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 4;
    return t;
  }, [text]);
  const mat = useMemo(
    () => new THREE.MeshBasicMaterial({ map: tex ?? undefined, transparent: true, color: new THREE.Color(hue), blending: THREE.AdditiveBlending, depthWrite: false, fog: true, side: THREE.DoubleSide, opacity: 0.95 }),
    [tex, hue],
  );
  useEffect(() => () => { tex?.dispose(); mat.dispose(); }, [tex, mat]);
  if (!tex) return null;
  // mirror flips the plane in x so text still reads left-to-right when the gate is
  // rotated to face the +x approach (the side leg) rather than the +z approach.
  return (
    <mesh material={mat} position={localPos} scale={[mirror ? -6 : 6, 1.2, 1]}>
      <planeGeometry args={[1, 1]} />
    </mesh>
  );
}

// Post-shatter gauntlet gates: glowing vector barriers (Star Wars Arcade trench
// look) that block one side of the aisle, each named for a piece of the 9-5
// grind. Real colliders are built separately (buildGateColliders); this is just
// the look. Placed relative to the shattered wall, shown only during the escape run.
function JourneyGates({ wallZ, hue, gates, pulseRef }: { wallZ: number; hue: string; gates: JourneyGate[]; pulseRef: React.MutableRefObject<Pulse> }) {
  const boxGeo = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), []);
  const fillGeo = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  const gridGeo = useMemo(() => {
    const pts: number[] = [];
    const nx = 4;
    const ny = 9;
    for (let i = 0; i <= nx; i++) { const u = -0.5 + i / nx; pts.push(u, -0.5, 0, u, 0.5, 0); }
    for (let j = 0; j <= ny; j++) { const vv = -0.5 + j / ny; pts.push(-0.5, vv, 0, 0.5, vv, 0); }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, []);
  const edgeMat = useMemo(
    () => new THREE.LineBasicMaterial({ color: new THREE.Color(hue), transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
    [hue]
  );
  const gridMat = useMemo(
    () => new THREE.LineBasicMaterial({ color: new THREE.Color(hue), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }),
    [hue]
  );
  // A normal-blended dark-hue panel that actually dims what's behind it, so the
  // gate reads as a solid obstacle instead of a wireframe you see straight through.
  const fillMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: new THREE.Color(hue).multiplyScalar(0.42), transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide, fog: true }),
    [hue]
  );
  useEffect(() => () => { boxGeo.dispose(); fillGeo.dispose(); gridGeo.dispose(); edgeMat.dispose(); gridMat.dispose(); fillMat.dispose(); }, [boxGeo, fillGeo, gridGeo, edgeMat, gridMat, fillMat]);
  // Tie the gates to the stems the columns leave alone: a sharp SNARE flash on
  // the backbeat plus a slow BASS breathe. (The columns throb on kick / chord /
  // warp, so these read as a distinct second voice in the same track.)
  useFrame(() => {
    const p = pulseRef.current;
    edgeMat.opacity = Math.min(1, 0.72 + p.snare * 0.55);
    gridMat.opacity = 0.42 + p.snare * 0.4 + p.bass * 0.16;
    fillMat.opacity = 0.46 + p.snare * 0.22 + p.bass * 0.12;
  });

  const h = GATE_TOP - FLOOR_Y;
  const cy = (FLOOR_Y + GATE_TOP) / 2;
  return (
    <>
      {gates.map((g, i) => {
        const cx = g.block === "right" ? GATE_AISLE / 2 : -GATE_AISLE / 2;
        return (
          <group key={i} position={[cx, cy, wallZ + g.dz]}>
            <mesh geometry={fillGeo} material={fillMat} scale={[GATE_AISLE, h, 1]} renderOrder={-1} frustumCulled={false} />
            <lineSegments geometry={boxGeo} scale={[GATE_AISLE, h, GATE_HWZ * 2]} material={edgeMat} frustumCulled={false} />
            <lineSegments geometry={gridGeo} scale={[GATE_AISLE, h, 1]} material={gridMat} frustumCulled={false} />
            <GateLabel text={g.label} localPos={[0, LABEL_WORLD_Y - cy, GATE_HWZ + 0.06]} hue={hue} />
          </group>
        );
      })}
    </>
  );
}

// The leg slalom (stretch 2): the same gate look as JourneyGates but rotated to
// face the +x ending run, each gate blocking the near or far half of the leg's
// depth. Tied to the same snare/bass stems. Labels are mirrored so they still read
// left-to-right from the +x approach. Only mounted once the comfort wall breaks.
function LegGates({ wallZ, hue, pulseRef }: { wallZ: number; hue: string; pulseRef: React.MutableRefObject<Pulse> }) {
  const boxGeo = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), []);
  const fillGeo = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  const gridGeo = useMemo(() => {
    const pts: number[] = [];
    const nx = 4;
    const ny = 9;
    for (let i = 0; i <= nx; i++) { const u = -0.5 + i / nx; pts.push(u, -0.5, 0, u, 0.5, 0); }
    for (let j = 0; j <= ny; j++) { const vv = -0.5 + j / ny; pts.push(-0.5, vv, 0, 0.5, vv, 0); }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, []);
  const edgeMat = useMemo(() => new THREE.LineBasicMaterial({ color: new THREE.Color(hue), transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }), [hue]);
  const gridMat = useMemo(() => new THREE.LineBasicMaterial({ color: new THREE.Color(hue), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }), [hue]);
  const fillMat = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color(hue).multiplyScalar(0.42), transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide, fog: true }), [hue]);
  useEffect(() => () => { boxGeo.dispose(); fillGeo.dispose(); gridGeo.dispose(); edgeMat.dispose(); gridMat.dispose(); fillMat.dispose(); }, [boxGeo, fillGeo, gridGeo, edgeMat, gridMat, fillMat]);
  useFrame(() => {
    const p = pulseRef.current;
    edgeMat.opacity = Math.min(1, 0.72 + p.snare * 0.55);
    gridMat.opacity = 0.42 + p.snare * 0.4 + p.bass * 0.16;
    fillMat.opacity = 0.46 + p.snare * 0.22 + p.bass * 0.12;
  });

  const h = GATE_TOP - FLOOR_Y;
  const cy = (FLOOR_Y + GATE_TOP) / 2;
  const turnZ = wallZ + L1_TURN_DZ;
  const legCz = turnZ + L1_LEG_W / 2;
  const legNearZ = turnZ + L1_LEG_W;
  return (
    <>
      {L1_LEG_GATES.map((g, i) => {
        const x = CORRIDOR_HW + g.dx;
        const z = g.block === "near" ? (legCz + legNearZ) / 2 : (turnZ + legCz) / 2;
        // Rotated -90 about Y: local x -> world +z (the leg depth the gate blocks),
        // local z -> world -x (thin, facing the approach).
        return (
          <group key={i} position={[x, cy, z]} rotation={[0, -Math.PI / 2, 0]}>
            <mesh geometry={fillGeo} material={fillMat} scale={[LEG_GATE_BLOCK_Z, h, 1]} renderOrder={-1} frustumCulled={false} />
            <lineSegments geometry={boxGeo} scale={[LEG_GATE_BLOCK_Z, h, GATE_HWZ * 2]} material={edgeMat} frustumCulled={false} />
            <lineSegments geometry={gridGeo} scale={[LEG_GATE_BLOCK_Z, h, 1]} material={gridMat} frustumCulled={false} />
            <GateLabel text={g.label} localPos={[0, LABEL_WORLD_Y - cy, GATE_HWZ + 0.06]} mirror hue={hue} />
          </group>
        );
      })}
    </>
  );
}

// Gauntlet stage B: the comfort wall. A warm, inviting full-aisle barrier (the
// opposite read of the cold glitch wall) that beckons you to stay. It breathes a
// soft amber glow; the only way past is to speak the verb, which dissolves it
// into warm shards. Real collider is built separately (buildComfortCollider).
const COMFORT_HUE = "#ffb060"; // warm amber - comfort, not the cold machine
function ComfortWall({ z }: { z: number }) {
  const w = COMFORT_HALF_W * 2;
  const h = COMFORT_TOP - FLOOR_Y;
  const cy = FLOOR_Y + h / 2;
  const fillGeo = useMemo(() => new THREE.PlaneGeometry(w, h), [w, h]);
  const fillMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: new THREE.Color(COMFORT_HUE), transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false, fog: true }),
    [],
  );
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, 0.6)), [w, h]);
  const edgeMat = useMemo(
    () => new THREE.LineBasicMaterial({ color: new THREE.Color(COMFORT_HUE), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
    [],
  );
  const gridGeo = useMemo(() => {
    const pts: number[] = [];
    const nx = 9;
    const ny = 12;
    for (let i = 0; i <= nx; i++) { const u = (-0.5 + i / nx) * w; pts.push(u, -h / 2, 0, u, h / 2, 0); }
    for (let j = 0; j <= ny; j++) { const vv = (-0.5 + j / ny) * h; pts.push(-w / 2, vv, 0, w / 2, vv, 0); }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [w, h]);
  const gridMat = useMemo(
    () => new THREE.LineBasicMaterial({ color: new THREE.Color(COMFORT_HUE), transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }),
    [],
  );
  useEffect(() => () => { fillGeo.dispose(); fillMat.dispose(); edges.dispose(); edgeMat.dispose(); gridGeo.dispose(); gridMat.dispose(); }, [fillGeo, fillMat, edges, edgeMat, gridGeo, gridMat]);
  useFrame((state) => {
    fillMat.opacity = 0.13 + 0.06 * Math.sin(state.clock.elapsedTime * 1.4); // a slow warm breath - stay, it's easier here
  });
  return (
    <group position={[0, cy, z]}>
      <mesh geometry={fillGeo} material={fillMat} frustumCulled={false} />
      <lineSegments geometry={edges} material={edgeMat} frustumCulled={false} />
      <lineSegments geometry={gridGeo} material={gridMat} frustumCulled={false} />
    </group>
  );
}

// The escape corridor's boundary: real vector walls that box the L-shaped route
// (start cap, side walls, the turn, the side leg, the finish cap) so neither end
// is an infinite hallway. One dim phosphor grid per wall slab, world-spaced lines.
// The matching colliders come from buildEscapeColliders, off the same WallSeg list.
function EscapeWalls({ walls, hue }: { walls: WallSeg[]; hue: string }) {
  const built = useMemo(() => {
    return walls.map((w) => {
      const h = w.top - FLOOR_Y;
      const cy = (FLOOR_Y + w.top) / 2;
      const len = Math.abs(w.to - w.from);
      const mid = (w.from + w.to) / 2;
      const nx = Math.max(2, Math.round(len / 8));
      const ny = Math.max(2, Math.round(h / 6));
      const pts: number[] = [];
      for (let i = 0; i <= nx; i++) { const u = (-0.5 + i / nx) * len; pts.push(u, -h / 2, 0, u, h / 2, 0); }
      for (let j = 0; j <= ny; j++) { const vv = (-0.5 + j / ny) * h; pts.push(-len / 2, vv, 0, len / 2, vv, 0); }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
      const pos: [number, number, number] = w.axis === "z" ? [mid, cy, w.c] : [w.c, cy, mid];
      const rotY = w.axis === "z" ? 0 : Math.PI / 2;
      return { geo, pos, rotY };
    });
  }, [walls]);
  // Dim, structural cyan-steel (not the hot hue) so the walls read as architecture.
  const color = useMemo(() => new THREE.Color(hue).lerp(new THREE.Color("#0b2733"), 0.62), [hue]);
  const mat = useMemo(
    () => new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }),
    [color],
  );
  useEffect(() => () => { built.forEach((b) => b.geo.dispose()); mat.dispose(); }, [built, mat]);
  return (
    <>
      {built.map((b, i) => (
        <lineSegments key={i} geometry={b.geo} material={mat} position={b.pos} rotation={[0, b.rotY, 0]} frustumCulled={false} />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Scene: the corridor + the per-frame beat dispatcher + the level set-pieces.
// ---------------------------------------------------------------------------
function Scene({
  level,
  pillars,
  reactive,
  skinTextureUrl,
  audioRef,
  pulseRef,
  phase,
  breakInfo,
  gameRef,
  signal,
  collected,
  sirens,
  egoDissolved,
  showExit,
  onShatterDone,
}: {
  level: LevelConfig;
  pillars: Pillar[];
  reactive: ReactiveData | null;
  skinTextureUrl: string | null;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  pulseRef: React.MutableRefObject<Pulse>;
  phase: Phase;
  breakInfo: BreakInfo | null;
  gameRef: React.MutableRefObject<GameState>;
  signal: Signal[];
  collected: boolean[];
  sirens: Siren[];
  egoDissolved: number;
  showExit: boolean;
  onShatterDone: () => void;
}) {
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), []);
  const boxGeo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const runeGeo = useMemo(() => new THREE.EdgesGeometry(new THREE.OctahedronGeometry(2.4, 0)), []);
  useEffect(() => () => { edges.dispose(); boxGeo.dispose(); runeGeo.dispose(); }, [edges, boxGeo, runeGeo]);

  const cyanMat = useMemo(
    () => new THREE.LineBasicMaterial({ color: CYAN, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }),
    [],
  );
  const accentMat = useMemo(
    () => new THREE.LineBasicMaterial({ color: new THREE.Color(level.hue), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }),
    [level.hue],
  );
  const runeMat = useMemo(
    () => new THREE.LineBasicMaterial({ color: new THREE.Color(level.hue), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
    [level.hue],
  );
  useEffect(() => () => { accentMat.dispose(); runeMat.dispose(); }, [accentMat, runeMat]);
  useEffect(() => () => cyanMat.dispose(), [cyanMat]);

  const texture = useMemo(() => {
    if (!skinTextureUrl) return null;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    const tex = loader.load(skinTextureUrl);
    tex.colorSpace = THREE.LinearSRGBColorSpace; // OutputPass does the single sRGB encode
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    return tex;
  }, [skinTextureUrl]);
  useEffect(() => () => { texture?.dispose(); }, [texture]);

  const skinned = useMemo(() => {
    const tint = new THREE.Color(level.hue);
    return pillars
      .filter((p) => p.skin)
      .map((pillar, i) => ({
        pillar,
        mat: makePillarSkinMaterial({
          seed: i * 1.618 + level.id,
          glitchId: pillar.glitchId,
          tint: tint.clone(),
          texture,
          hasTexture: !!texture,
          fogDensity: FOG_DENSITY,
        }),
      }));
  }, [pillars, level.hue, level.id, texture]);
  useEffect(() => () => { skinned.forEach((s) => s.mat.dispose()); }, [skinned]);

  const runeRef = useRef<THREE.LineSegments>(null);
  const groupRef = useRef<THREE.Group>(null); // scene root - swayed subtly by the warp synth
  const skinMeshRefs = useRef<(THREE.Mesh | null)[]>([]);
  const st = useRef({ kick: 0, snare: 0, tom: 0, clap: 0, bass: 0, bassPulse: 0, chord: 0, warp: 0, nextIdx: 0 });

  useFrame(({ clock }, delta) => {
    const dt = Math.min(delta, 0.05);
    const s = st.current;
    const audio = audioRef.current;

    s.kick *= Math.pow(0.5, dt / 0.11);
    s.snare *= Math.pow(0.5, dt / 0.08);
    s.tom *= Math.pow(0.5, dt / 0.07);
    s.clap *= Math.pow(0.5, dt / 0.05);
    s.bassPulse *= Math.pow(0.5, dt / 0.2);
    if (s.kick < 0.001) s.kick = 0;
    if (s.snare < 0.001) s.snare = 0;
    if (s.tom < 0.001) s.tom = 0;
    if (s.clap < 0.001) s.clap = 0;
    if (s.bassPulse < 0.001) s.bassPulse = 0;

    if (reactive?.beatData && audio && !audio.paused && audio.currentTime > 0) {
      const bd = reactive.beatData;
      const off = reactive.beatOffset;
      const t = audio.currentTime;

      if (s.nextIdx > 0 && t + SLOP < bd[s.nextIdx - 1].at + off) {
        let lo = 0, hi = bd.length;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (bd[mid].at + off < t - SLOP) lo = mid + 1;
          else hi = mid;
        }
        s.nextIdx = lo;
      }
      while (s.nextIdx < bd.length && bd[s.nextIdx].at + off < t - SLOP) s.nextIdx++;
      while (s.nextIdx < bd.length && t + SLOP >= bd[s.nextIdx].at + off) {
        const ev = bd[s.nextIdx];
        s.nextIdx++;
        const kv = ev.k ?? 0;
        const sv = ev.s ?? 0;
        const tov = ev.to ?? 0;
        const clv = ev.cl ?? 0;
        const bpv = ev.bp ?? 0;
        if (sv >= SNARE_THRESH) {
          s.snare = Math.min(1.2, Math.max(s.snare, SNARE_FLOOR + sv * SNARE_RANGE));
        } else if (kv >= KICK_THRESH) {
          s.kick = Math.min(1.2, Math.max(s.kick, KICK_FLOOR + kv * KICK_RANGE));
        }
        if (tov >= TOM_THRESH) {
          s.tom = Math.min(1, Math.max(s.tom, 0.4 + tov * 0.6));
        }
        if (clv >= CLAP_THRESH) {
          s.clap = Math.min(1, Math.max(s.clap, 0.5 + clv * 0.5));
        }
        if (bpv >= BASS_PULSE_THRESH) {
          s.bassPulse = Math.min(1, Math.max(s.bassPulse, 0.4 + bpv * 0.6));
        }
      }

      if (reactive.bassSynthEnvelope && reactive.bassSynthEnvelopeHz) {
        const env = reactive.bassSynthEnvelope;
        const hz = reactive.bassSynthEnvelopeHz;
        const fIdx = (t - off) * hz;
        const i0 = Math.floor(fIdx);
        let target = 0;
        if (i0 >= 0 && i0 < env.length) {
          const a = env[i0];
          const b = env[i0 + 1] ?? a;
          target = a * (1 - (fIdx - i0)) + b * (fIdx - i0);
        }
        s.bass += (target - s.bass) * (1 - Math.pow(0.001, dt / 0.4));
      }

      // Extra continuous synth channels: chord (harmonic glow) + warp (spatial
      // warp). Followed the same way as the bass synth, smoothed toward target.
      const se = reactive.synthEnvelopes;
      const chordTgt = se ? sampleEnv(se.chord, t, off) : 0;
      const warpTgt = se ? sampleEnv(se.warp, t, off) : 0;
      s.chord += (chordTgt - s.chord) * (1 - Math.pow(0.001, dt / 0.3));
      s.warp += (warpTgt - s.warp) * (1 - Math.pow(0.001, dt / 0.3));
    } else {
      const breath = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 0.7);
      s.bass += (0.18 + 0.22 * breath - s.bass) * (1 - Math.pow(0.001, dt / 0.5));
      s.chord += (0 - s.chord) * (1 - Math.pow(0.001, dt / 0.5));
      s.warp += (0 - s.warp) * (1 - Math.pow(0.001, dt / 0.5));
    }

    const p = pulseRef.current;
    p.kick = s.kick;
    p.snare = s.snare;
    p.tom = s.tom;
    p.clap = s.clap;
    p.bass = s.bass;
    p.bassPulse = s.bassPulse;
    p.chord = s.chord;
    p.warp = s.warp;

    // Warp synth: a very subtle whole-scene sway (the space bends as the warp
    // sound moves). Per-pillar vertex ripple is added in the skin shader below;
    // this is the gentle global component. Kept small on purpose. The tom
    // (full drum kit) adds a fast high-frequency positional jitter on top - the
    // groove gives the whole corridor body.
    const grp = groupRef.current;
    if (grp) {
      const w = s.warp;
      const tt = clock.elapsedTime;
      const shake = s.tom * 0.22;
      grp.rotation.z = Math.sin(tt * 1.3) * 0.012 * w + Math.sin(tt * 57) * 0.01 * s.tom;
      grp.position.x = Math.sin(tt * 0.9) * 0.25 * w + Math.sin(tt * 67) * shake;
      grp.position.y = Math.sin(tt * 73) * shake * 0.7;
    }

    if (runeRef.current) {
      runeRef.current.rotation.y += 0.006;
      runeRef.current.rotation.x += 0.0025;
      const rm = runeRef.current.material as THREE.LineBasicMaterial;
      rm.opacity = 0.55 + 0.45 * s.snare + 0.15 * s.bass; // rune strobes on snare
    }

    const tNow = clock.elapsedTime;
    // Skinned pillars corrupt + brighten on hits; in L1 they corrupt harder as
    // the wall tension rises (the machine glitching as you name your way out).
    const tensionGlitch = gameRef.current.tension * 0.45;
    const glitchAmt = Math.min(1, s.kick * 0.7 + s.snare * 0.9 + s.bassPulse * 0.3 + tensionGlitch);
    const meshes = skinMeshRefs.current;
    for (let i = 0; i < meshes.length; i++) {
      const m = meshes[i];
      if (!m) continue;
      const u = (m.material as THREE.ShaderMaterial).uniforms;
      u.uTime.value = tNow;
      u.uBeat.value = s.kick;
      u.uGlitch.value = glitchAmt;
      u.uGlow.value = s.chord; // harmonic glow swell (subtle warm emissive)
      u.uWarp.value = s.warp; // spatial warp vertex ripple (subtle)
    }
  });

  return (
    <>
    <ClapBurst hue={level.hue} pulseRef={pulseRef} />
    <group ref={groupRef}>
      <FloorGrid pulseRef={pulseRef} />
      {pillars.map((p, i) => (
        <lineSegments
          key={`w${i}`}
          geometry={edges}
          material={p.accent ? accentMat : cyanMat}
          position={[p.x, FLOOR_Y + p.h / 2, p.z]}
          scale={[p.w, p.h, p.w]}
        />
      ))}
      {skinned.map((sk, i) => (
        <mesh
          key={`s${i}`}
          ref={(el) => { skinMeshRefs.current[i] = el; }}
          geometry={boxGeo}
          material={sk.mat}
          position={[sk.pillar.x, FLOOR_Y + sk.pillar.h / 2, sk.pillar.z]}
          scale={[sk.pillar.w * 0.96, sk.pillar.h * 0.995, sk.pillar.w * 0.96]}
        />
      ))}

      {/* Goal rune for the free-explore levels (L2-L5). */}
      {phase === "explore" && (
        <lineSegments ref={runeRef} geometry={runeGeo} material={runeMat} position={[0, 1, RUNE_Z]} />
      )}

      {/* Blocker set-pieces (the thing The Word breaks). */}
      {phase === "treadmill" && <FalseWall hue={level.hue} gameRef={gameRef} />}
      {phase === "facade" && <Facade hue={level.hue} gameRef={gameRef} />}
      {phase === "breaking" && breakInfo && (
        <Shatter color={level.shatterColor} wallZ={breakInfo.wallZ} onDone={onShatterDone} />
      )}
      {(phase === "open" || phase === "complete") && breakInfo && showExit && (
        <ExitPortal hue={level.hue} portalZ={breakInfo.portalZ} x={breakInfo.portalX ?? 0} />
      )}

      {/* L3 signal fragments (gather to assemble the key). */}
      {phase === "collect" &&
        signal.map((s, i) =>
          collected[i] ? null : <SignalFragment key={`sig${i}`} x={s.x} y={s.y} z={s.z} color={level.hue} />,
        )}

      {/* L4 ride-the-waveform: the ribbon, the sirens, and the door/rune. */}
      {(phase === "ride" || (phase === "complete" && level.mechanic === "ride")) && (
        <>
          <WaveformRibbon hue={level.hue} />
          {sirens.map((s, i) => (
            <SirenOrb key={`siren${i}`} x={s.x} z={s.z} color="#ff2e63" />
          ))}
          <ExitPortal hue={level.hue} portalZ={-RIDE_END} x={ridePathX(-RIDE_END)} />
        </>
      )}

      {/* L5 ego boss: the mirror-self ringed by the programming you dissolve. */}
      {level.mechanic === "ego" && (phase === "ego" || phase === "complete") && level.ego && (
        <EgoArena hue={level.hue} dissolved={egoDissolved} total={level.ego.layers.length} />
      )}
    </group>
    </>
  );
}

// ---------------------------------------------------------------------------
// FlyCam: controller + AABB collision + the L1 treadmill / charge / strike /
// reach / freeze logic.
// ---------------------------------------------------------------------------
function FlyCam({
  colliders,
  phase,
  started,
  typing,
  gameRef,
  pulseRef,
  breakInfo,
  signal,
  hasKey,
  onStrike,
  onReach,
  onCollect,
  onAllCollected,
  onRuneReached,
  onDoorLocked,
  boundaryRef,
  field,
  comfortWallZ,
  onComfortNear,
}: {
  colliders: Collider[];
  phase: Phase;
  started: boolean;
  typing: boolean;
  gameRef: React.MutableRefObject<GameState>;
  pulseRef: React.MutableRefObject<Pulse>;
  breakInfo: BreakInfo | null;
  signal: Signal[];
  hasKey: boolean;
  onStrike: (info: BreakInfo) => void;
  onReach: () => void;
  onCollect: (i: number) => void;
  onAllCollected: () => void;
  onRuneReached: () => void;
  onDoorLocked: () => void;
  boundaryRef: React.MutableRefObject<BoundaryHit>;
  field: FieldBounds | null;
  comfortWallZ: number | null; // L1 comfort wall world z (null when N/A)
  onComfortNear: () => void; // fired once when you reach the comfort wall
}) {
  const { camera } = useThree();
  const keys = useRef<Record<string, boolean>>({});
  const yaw = useRef(0);
  const vel = useRef(new THREE.Vector3());
  const shockCool = useRef(0); // counts down between Field discovery shocks
  const comfortFiredRef = useRef(false); // one-shot: have we announced the comfort wall yet
  // Reset the comfort-wall announce guard whenever the wall (re)appears for a run.
  useEffect(() => { comfortFiredRef.current = false; }, [comfortWallZ]);

  useEffect(() => {
    camera.position.set(0, 0, 16);
    const setKey = (down: boolean) => (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      keys.current[k] = down;
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " ", "w", "a", "s", "d", "q", "e"].includes(k)) {
        e.preventDefault();
      }
    };
    const kd = setKey(true);
    const ku = setKey(false);
    // If the window loses focus mid-press (alt-tab, click-away, devtools), the
    // keyup never arrives and the key would stay logically held - a phantom
    // strafe/turn that, because A and ArrowLeft are the common keys, reads as a
    // constant leftward coast. Drop all held keys + velocity on blur / tab-hide.
    const clearHeld = () => {
      keys.current = {};
      vel.current.set(0, 0, 0);
    };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    window.addEventListener("blur", clearHeld);
    document.addEventListener("visibilitychange", clearHeld);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      window.removeEventListener("blur", clearHeld);
      document.removeEventListener("visibilitychange", clearHeld);
    };
  }, [camera]);

  // The key you press to WAKE the game is also seen by the controller's keydown
  // listener; if its keyup is missed (or it was held through the wake), it would
  // read as a stuck movement key (the leftward-drift report). Clear held keys +
  // velocity on the wake transition so nothing carries into the first frame.
  useEffect(() => {
    if (started) {
      keys.current = {};
      vel.current.set(0, 0, 0);
    }
  }, [started]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const k = keys.current;
    const v = vel.current;
    const g = gameRef.current;

    // Frozen during the completion beat (transcended) and while speaking the
    // word (your hands are off the controls; you are communicating, not running).
    if (phase === "complete" || typing) {
      // Hands off the controls. Also drop any held keys so the letters typed
      // during The Word (e.g. the "a" in "shatter") can't leak in as a strafe
      // when control resumes.
      keys.current = {};
      v.set(0, 0, 0);
      return;
    }

    // Turn (zero momentum) + level horizon.
    if (k["arrowleft"]) yaw.current += TURN_RATE * dt;
    if (k["arrowright"]) yaw.current -= TURN_RATE * dt;
    const euler = new THREE.Euler(0, yaw.current, 0, "YXZ");
    camera.quaternion.setFromEuler(euler);

    const fwd = new THREE.Vector3(0, 0, -1).applyEuler(euler);
    const right = new THREE.Vector3(1, 0, 0).applyEuler(euler);
    if (k["w"] || k["arrowup"]) v.addScaledVector(fwd, ACCEL * dt);
    if (k["s"] || k["arrowdown"]) v.addScaledVector(fwd, -ACCEL * dt);
    if (k["a"]) v.addScaledVector(right, -ACCEL * dt);
    if (k["d"]) v.addScaledVector(right, ACCEL * dt);
    if (k["q"]) v.y -= ACCEL * dt;
    if (k["e"]) v.y += ACCEL * dt;

    v.multiplyScalar(Math.pow(DAMP_PER_SEC, dt));
    if (v.lengthSq() > MAX_SPEED * MAX_SPEED) v.setLength(MAX_SPEED);
    camera.position.addScaledVector(v, dt);

    if (camera.position.y < MIN_Y) {
      camera.position.setY(MIN_Y);
      if (v.y < 0) v.y = 0;
    }

    // AABB collision (per-axis, slide along walls, fly over short tops).
    for (const c of colliders) {
      if (camera.position.y >= c.top) continue;
      const dx = camera.position.x - c.x;
      const dz = camera.position.z - c.z;
      const ox = c.hwx + PLAYER_RADIUS - Math.abs(dx);
      const oz = c.hwz + PLAYER_RADIUS - Math.abs(dz);
      if (ox > 0 && oz > 0) {
        if (ox < oz) {
          camera.position.setX(c.x + (dx < 0 ? -1 : 1) * (c.hwx + PLAYER_RADIUS));
          v.x = 0;
        } else {
          camera.position.setZ(c.z + (dz < 0 ? -1 : 1) * (c.hwz + PLAYER_RADIUS));
          v.z = 0;
        }
      }
    }

    // The Field (column levels only): clamp the camera inside the corridor -
    // left/right/front faces snapped to the columns' rear faces, plus a back
    // face behind spawn and a ceiling - so you cannot drift off into the void.
    // A fresh push into a face fires a discovery shock at the contact point.
    if (field) {
      const p = camera.position;
      shockCool.current = Math.max(0, shockCool.current - dt);
      // The eye is clamped a standoff short of each face, but the pulse fires on
      // the face plane itself (beside the eye), so the wall reacts where you
      // pressed against it while you never pass into it.
      const fireShock = (face: FieldFace, hx: number, hy: number, hz: number) => {
        if (shockCool.current > 0) return;
        shockCool.current = BOUND_SHOCK_COOLDOWN;
        const b = boundaryRef.current;
        b.seq += 1;
        b.x = hx;
        b.y = hy;
        b.z = hz;
        b.face = face;
      };
      const xLimit = field.x - FIELD_STANDOFF;
      const zFarLimit = field.zFar + FIELD_STANDOFF;
      const zNearLimit = BOUND_Z_NEAR - FIELD_STANDOFF;
      if (p.x > xLimit) {
        p.setX(xLimit);
        if (v.x > 0) { fireShock("right", field.x, p.y, p.z); v.x = 0; }
      } else if (p.x < -xLimit) {
        p.setX(-xLimit);
        if (v.x < 0) { fireShock("left", -field.x, p.y, p.z); v.x = 0; }
      }
      if (p.z < zFarLimit) {
        p.setZ(zFarLimit);
        if (v.z < 0) { fireShock("front", p.x, p.y, field.zFar); v.z = 0; }
      } else if (p.z > zNearLimit) {
        p.setZ(zNearLimit);
        if (v.z > 0) { fireShock("back", p.x, p.y, BOUND_Z_NEAR); v.z = 0; }
      }
    }

    // Ceiling: always contain vertically. The Field does the x/z clamp on column
    // levels; the escape run drops the Field for the wall-boxed L-turn, but the
    // roof still has to hold either way (walls cannot be flown over).
    if (camera.position.y > BOUND_Y_TOP) {
      camera.position.setY(BOUND_Y_TOP);
      if (v.y > 0) v.y = 0;
    }

    // Treadmill (L1): wrap the player by one corridor period so forward flight
    // never advances. The layout repeats every WRAP_LEN, so the wrap is seamless.
    if (phase === "treadmill") {
      if (camera.position.z < WRAP_HI - WRAP_LEN) camera.position.setZ(camera.position.z + WRAP_LEN);
      else if (camera.position.z > WRAP_HI) camera.position.setZ(camera.position.z - WRAP_LEN);
    }

    // The word was spoken (typing parser requested it): break the blocker - the
    // wall (treadmill) or the front (facade). Same shatter -> exit pipeline.
    if ((phase === "treadmill" || phase === "facade") && g.strikeRequested && !g.struck) {
      g.struck = true;
      const wallZ = camera.position.z - WALL_AHEAD;
      onStrike({ wallZ, portalZ: wallZ - PORTAL_BEYOND });
    }

    // Collect (L3): fly into signal fragments to gather them; all -> the key.
    if (phase === "collect") {
      for (let i = 0; i < signal.length; i++) {
        if (g.collected[i]) continue;
        const dx = camera.position.x - signal[i].x;
        const dy = camera.position.y - signal[i].y;
        const dz = camera.position.z - signal[i].z;
        if (dx * dx + dy * dy + dz * dz < COLLECT_REACH * COLLECT_REACH) {
          g.collected[i] = true;
          g.collectedCount += 1;
          onCollect(i);
          if (g.collectedCount >= signal.length && !g.keyDone) {
            g.keyDone = true;
            onAllCollected();
          }
        }
      }
    }

    // Ride (L4): follow the waveform; the sirens pull you off the more you
    // drift. Reach the end; the key opens the door to the rune.
    if (phase === "ride") {
      const center = ridePathX(camera.position.z);
      const offX = camera.position.x - center;
      g.drift = Math.min(1, Math.abs(offX) / RIDE_DRIFT_MAX);
      v.x += Math.max(-RIDE_DRIFT_MAX, Math.min(RIDE_DRIFT_MAX, offX)) * RIDE_DRIFT_ACCEL * dt; // pull; counter by steering
      if (v.z > -RIDE_SPEED) v.z = -RIDE_SPEED; // the wave carries you forward; you steer to stay centered
      // The hold is bounded - you cannot drift out of view entirely; at the
      // edge you are pinned (meter full) until you steer back, and you keep
      // moving forward.
      if (camera.position.x > center + RIDE_DRIFT_MAX) {
        camera.position.setX(center + RIDE_DRIFT_MAX);
        if (v.x > 0) v.x = 0;
      } else if (camera.position.x < center - RIDE_DRIFT_MAX) {
        camera.position.setX(center - RIDE_DRIFT_MAX);
        if (v.x < 0) v.x = 0;
      }
      if (camera.position.z <= -RIDE_END) {
        if (hasKey) {
          if (!g.reached) {
            g.reached = true;
            onRuneReached();
          }
        } else {
          camera.position.setZ(-RIDE_END);
          if (v.z < 0) v.z = 0;
          if (!g.lockedHit) {
            g.lockedHit = true;
            onDoorLocked();
          }
        }
      }
    }

    // Gauntlet stage B: cross the threshold into the comfort wall's reach (past
    // the slalom) and it announces itself. One-shot; the prompt then drives the
    // verb input. The full-aisle collider stops you here until you speak.
    if (comfortWallZ !== null && !comfortFiredRef.current && phase === "open") {
      if (camera.position.z < comfortWallZ + COMFORT_PROMPT_RANGE) {
        comfortFiredRef.current = true;
        onComfortNear();
      }
    }

    // The exit was always there: reach it to transcend. On L1 it sits around the
    // corner in the side leg (portalX), so test against both axes.
    if (phase === "open" && breakInfo && !g.reached) {
      const dz = camera.position.z - breakInfo.portalZ;
      const dx = camera.position.x - (breakInfo.portalX ?? 0);
      if (dx * dx + dz * dz < PORTAL_REACH * PORTAL_REACH) {
        g.reached = true;
        pulseRef.current.charge = 1; // light flood
        onReach();
      }
    }
  });

  return null;
}

// ---------------------------------------------------------------------------
// Top-level: level loader, L1 state machine, wake gate, audio, HUD.
// ---------------------------------------------------------------------------
export function TranscendSpike({ levelReactive }: { levelReactive: Record<number, ReactiveData | null> }) {
  const [started, setStarted] = useState(false);
  const [levelId, setLevelId] = useState(1);
  const [toast, setToast] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>(() => startPhaseFor(levelById(1)));
  const [breakInfo, setBreakInfo] = useState<BreakInfo | null>(null);
  // Gauntlet stage B (L1 comfort wall): comfortNear = you reached it and it has
  // announced itself (drives the verb prompt); comfortBroken = you spoke the
  // verb (collider drops, the way clears); comfortBreaking = the dissolve is
  // playing. The verb input reuses the shared typing state below.
  const [comfortNear, setComfortNear] = useState(false);
  const [comfortBroken, setComfortBroken] = useState(false);
  const [comfortBreaking, setComfortBreaking] = useState(false);
  // Account gate: L1-L2 free, L3+ needs a free account. hasAccount is read from
  // /api/auth/me; accountGate holds the level the player tried to reach gated.
  const [hasAccount, setHasAccount] = useState(false);
  const [accountGate, setAccountGate] = useState<number | null>(null);
  // L3 collect + the Journey-Key inventory (persists across levels = the chain).
  const [collected, setCollected] = useState<boolean[]>([]);
  const [inventory, setInventory] = useState<Inventory>({ key: true, rune: true }); // TEMP-UNLOCK: restore to { key: false, rune: false } before commit/push
  const [doorLocked, setDoorLocked] = useState(false); // door/match reached without the needed key
  const [paused, setPaused] = useState(false); // Esc pauses the game + music and reveals the cursor
  const rootRef = useRef<HTMLDivElement>(null); // for the cursor-scrim reveal
  const pointerRef = useRef({ x: -1, y: -1 }); // last pointer pos (no pos = -1 => hidden)
  const [egoDissolved, setEgoDissolved] = useState(0); // L5 programming layers dissolved
  // L5 climax: Opus reflects on each typed truth, and the reflection is what
  // dissolves the ring. egoThinking = awaiting the reflection ("the machine
  // hears you"); egoReflection = the line currently shown; finalReflection =
  // the closing line, reused as the completion subline. Refs mirror the state
  // so the keydown handler reads them without stale closures.
  const [egoThinking, setEgoThinking] = useState(false);
  const [egoReflection, setEgoReflection] = useState<string | null>(null);
  const [finalReflection, setFinalReflection] = useState<string | null>(null);
  const egoThinkingRef = useRef(false);
  const egoReflectionRef = useRef<string | null>(null);
  const finalReflectionRef = useRef<string | null>(null);
  const truthsRef = useRef<string[]>([]); // truths spoken this climax (context for the final synthesis)
  // Persistence (tm_progress): a stable client session id, the saved level to
  // resume into once account access is known, and a one-shot guard so resume
  // fires at most once. rewardNote surfaces the completion coupon on the card.
  const sessionIdRef = useRef("");
  const resumedRef = useRef(false);
  const [rewardNote, setRewardNote] = useState<string | null>(null);
  const rideFillRef = useRef<HTMLSpanElement>(null);
  // Live mirror of inventory so the typing handler can check it without churn.
  const inventoryRef = useRef(inventory);
  useEffect(() => { inventoryRef.current = inventory; }, [inventory]);

  const level = levelById(levelId);
  const pillars = useMemo(() => {
    const m = levelById(levelId).mechanic;
    return m === "ride" || m === "ego" ? [] : buildPillars(levelId, m === "treadmill"); // open void for ride + ego
  }, [levelId]);
  const colliders = useMemo(() => buildColliders(pillars), [pillars]);
  const field = useMemo(() => fieldBounds(colliders), [colliders]);
  // Post-shatter gauntlet (L1): vector barrier gates, placed relative to the
  // shattered wall. They join the collider set only during the escape run.
  const gateColliders = useMemo(() => {
    if (level.id !== 1 || !breakInfo) return [];
    // Stretch 1 (the slalom before the comfort wall). Stretch 2 lives in the leg.
    const gates = buildGateColliders(L1_GAUNTLET, breakInfo.wallZ);
    // The comfort wall (stage B) joins the gauntlet as a full-aisle barrier until
    // you speak the verb; once broken its collider drops so you can pass through.
    if (level.comfortWord && !comfortBroken) gates.push(buildComfortCollider(breakInfo.wallZ));
    return gates;
  }, [level.id, level.comfortWord, breakInfo, comfortBroken]);
  // World z of the comfort wall, for the controller's approach trigger + the mesh.
  const comfortWallZ = useMemo(
    () => (level.id === 1 && breakInfo && level.comfortWord ? breakInfo.wallZ + L1_COMFORT_DZ : null),
    [level.id, breakInfo, level.comfortWord],
  );
  // The escape walls, split into the always-on MAIN corridor and the LEG (the
  // ending run) that only reveals once the comfort wall breaks.
  const escapeWalls = useMemo(
    () => (level.id === 1 && breakInfo ? buildEscapeWalls(breakInfo.wallZ) : { main: [], leg: [] }),
    [level.id, breakInfo],
  );
  const escapeMainColliders = useMemo(() => buildEscapeColliders(escapeWalls.main), [escapeWalls]);
  const escapeLegColliders = useMemo(() => buildEscapeColliders(escapeWalls.leg), [escapeWalls]);
  const legGateColliders = useMemo(
    () => (level.id === 1 && breakInfo ? buildLegGateColliders(breakInfo.wallZ) : []),
    [level.id, breakInfo],
  );
  const escapeActive = phase === "open" && level.id === 1 && !!breakInfo;
  const activeColliders = useMemo(() => {
    // The boxed walls bound the player in the escape run (pillars are decoration).
    // The leg + its slalom only collide once the comfort wall is broken - before
    // that you cannot reach them anyway, and they stay hidden behind the wall.
    if (escapeActive) {
      const base = gateColliders.concat(escapeMainColliders);
      return comfortBroken ? base.concat(escapeLegColliders, legGateColliders) : base;
    }
    return phase === "open" && gateColliders.length ? colliders.concat(gateColliders) : colliders;
  }, [escapeActive, comfortBroken, phase, colliders, gateColliders, escapeMainColliders, escapeLegColliders, legGateColliders]);
  // The invisible rectangular Field clamps the player to the straight corridor, so
  // it cannot coexist with the L-turn - drop it (and its forcefield walls) during
  // the escape run; the visible walls + the always-on ceiling do the containing.
  const activeField = escapeActive ? null : field;
  const signal = useMemo(() => (level.collect ? buildSignal(levelId, level.collect.count) : []), [levelId, level.collect]);
  const sirens = useMemo(() => (level.mechanic === "ride" ? buildSirens() : []), [level.mechanic]);

  // Per-level reactive cue sheet from the server. Levels whose song row has no
  // streaming_path resolve to null and play on the ambient placeholder pulse.
  const activeReactive = levelReactive[levelId] ?? null;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pulseRef = useRef<Pulse>({ kick: 0, snare: 0, tom: 0, clap: 0, bass: 0, bassPulse: 0, charge: level.charge / 100, chord: 0, warp: 0 });
  const gameRef = useRef<GameState>({ struck: false, reached: false, tension: 0, strikeRequested: false, collected: [], collectedCount: 0, keyDone: false, drift: 0, lockedHit: false, egoDissolved: 0 });
  const boundaryRef = useRef<BoundaryHit>({ seq: 0, x: 0, y: 0, z: 0, face: "front" });
  const flashRef = useRef<HTMLDivElement>(null); // screen-edge glitch on a Field hit

  // L1 "The Word" typing state. typedRef/triesRef are the source of truth for
  // the key handler (no stale closures); the state mirrors drive the HUD.
  const [typingMode, setTypingMode] = useState(false);
  const [typed, setTyped] = useState("");
  const [tries, setTries] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [wrongFlash, setWrongFlash] = useState(false);
  const typedRef = useRef("");
  const triesRef = useRef(0);

  // Loading a level resets its run: L1 starts on the treadmill, others
  // free-explore. Done in the event handler (not an effect) so there is no
  // cascading setState-in-effect.
  const loadLevel = useCallback((n: number) => {
    const lv = levelById(n);
    const fresh = lv.collect ? new Array<boolean>(lv.collect.count).fill(false) : [];
    // Reset the per-level run. Inventory (Journey Keys) deliberately persists.
    gameRef.current = {
      struck: false, reached: false, tension: 0, strikeRequested: false,
      collected: fresh.slice(), collectedCount: 0, keyDone: false,
      drift: 0, lockedHit: false, egoDissolved: 0,
    };
    pulseRef.current.charge = lv.charge / 100;
    typedRef.current = "";
    triesRef.current = 0;
    setTyped("");
    setTries(0);
    setShowHint(false);
    setWrongFlash(false);
    setTypingMode(false);
    setCollected(fresh);
    setDoorLocked(false);
    setEgoDissolved(0);
    // Reset the L5 climax run.
    egoThinkingRef.current = false;
    egoReflectionRef.current = null;
    finalReflectionRef.current = null;
    truthsRef.current = [];
    setEgoThinking(false);
    setEgoReflection(null);
    setFinalReflection(null);
    setBreakInfo(null);
    setComfortNear(false);
    setComfortBroken(false);
    setComfortBreaking(false);
    setAccountGate(null);
    setPhase(startPhaseFor(lv));
    setLevelId(n);
    setToast(`L${n} - ${lv.stage} - ${lv.song.toUpperCase()}`);
    track("tm_level_start", { level: n, stage: lv.stage, song: lv.song });
  }, []);

  // L3 collect handlers.
  const onCollect = useCallback((i: number) => {
    setCollected((prev) => {
      const next = prev.slice();
      next[i] = true;
      return next;
    });
    track("tm_signal_collected", { level: 3, index: i });
  }, []);
  const onAllCollected = useCallback(() => {
    setInventory((inv) => ({ ...inv, key: true }));
    setBreakInfo({ wallZ: -COLLECT_EXIT_Z, portalZ: -COLLECT_EXIT_Z });
    setPhase("open");
    track("tm_key_assembled", { level: 3 });
  }, []);

  // L4 ride handlers.
  const onRuneReached = useCallback(() => {
    setInventory((inv) => ({ ...inv, rune: true }));
    pulseRef.current.charge = 1; // light flood
    setPhase("complete");
    track("tm_rune_acquired", { level: 4 });
  }, []);
  const onDoorLocked = useCallback(() => {
    setDoorLocked(true);
    track("tm_door_locked", { level: 4 });
  }, []);

  // Gate the climb: free levels load straight through; gated levels (3+) raise
  // the account gate instead of loading, unless the player already has one.
  const requestLevel = useCallback(
    (n: number) => {
      if (n <= FREE_LEVELS || hasAccount) {
        loadLevel(n);
      } else {
        setAccountGate(n);
        track("tm_account_gate", { from_level: levelId, to_level: n });
      }
    },
    [hasAccount, levelId, loadLevel],
  );

  // Audio source follows the active level; play once woken.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const url = activeReactive?.streamingUrl ?? null;
    if (!url) {
      a.pause();
      a.removeAttribute("src");
      return;
    }
    if (a.getAttribute("src") !== url) {
      a.src = url;
      a.load();
    }
    if (started) {
      a.volume = 0.85;
      a.play().catch(() => {});
    }
  }, [activeReactive, started]);

  // On mount: resolve account access (gates resume into L3+) and load saved
  // progress, in one async pass. Restores the Journey-Key inventory (it persists
  // across sessions) and resumes into the furthest accessible level. setState
  // runs only in the post-await callbacks (the endorsed pattern), never
  // synchronously in the effect body.
  useEffect(() => {
    sessionIdRef.current = getTmSessionId();
    let cancelled = false;
    void (async () => {
      let account = false;
      try {
        const me = await fetch("/api/auth/me").then((r) => r.json());
        account = !!me?.user;
      } catch {
        /* treat as anon */
      }
      if (cancelled) return;
      setHasAccount(account);

      let payload: { progress?: { current_level?: number; inventory?: Inventory } | null } | null = null;
      try {
        payload = await fetch(
          `/api/transcend/progress?sid=${encodeURIComponent(sessionIdRef.current)}`,
        ).then((r) => r.json());
      } catch {
        /* no saved progress */
      }
      if (cancelled || !payload?.progress) return;
      const p = payload.progress;
      if (p.inventory && (p.inventory.key || p.inventory.rune)) {
        setInventory({ key: !!p.inventory.key, rune: !!p.inventory.rune });
      }
      // Resume into the furthest level the player can reach (anon caps at
      // FREE_LEVELS; an account opens 3+). One-shot, and only if they have not
      // already started interacting.
      const target = typeof p.current_level === "number" ? p.current_level : 1;
      if (!TEMP_START_L1 && !resumedRef.current && target > 1 && (target <= FREE_LEVELS || account)) {
        resumedRef.current = true;
        loadLevel(target);
      }
    })();
    return () => { cancelled = true; };
  }, [loadLevel]);

  // Persist furthest level + inventory whenever either changes during play.
  useEffect(() => {
    if (!started) return;
    postTmProgress(sessionIdRef.current, levelId, inventory);
  }, [started, levelId, inventory]);

  const wake = useCallback(() => {
    setStarted(true);
    track("tm_wake");
    const l1 = levelById(1);
    track("tm_level_start", { level: 1, stage: l1.stage, song: l1.song });
    const a = audioRef.current;
    if (a && activeReactive?.streamingUrl) {
      a.volume = 0.85;
      a.play().catch(() => {});
    }
  }, [activeReactive]);

  // Wake gate: any key wakes (also the audio gesture unlock).
  useEffect(() => {
    if (started) return;
    const onKey = () => wake();
    window.addEventListener("keydown", onKey, { once: true });
    return () => window.removeEventListener("keydown", onKey);
  }, [started, wake]);

  // Level loader: number keys 1-5 swap levels once woken.
  useEffect(() => {
    if (!started) return;
    const onKey = (e: KeyboardEvent) => {
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= LEVELS.length) requestLevel(n);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [started, requestLevel]);

  // Esc pauses the game + music (and reveals the cursor). It toggles, so Esc
  // again resumes. Suppressed during a typing climax, where Esc means "step
  // back" (the Word/ego handlers own it then) and you are stationary anyway.
  useEffect(() => {
    if (!started) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !typingMode) {
        e.preventDefault();
        setPaused((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [started, typingMode]);

  // Pause stops the music and freezes the render loop; resume restarts both.
  useEffect(() => {
    const a = audioRef.current;
    if (paused) {
      if (a && !a.paused) a.pause();
    } else if (started && a && a.src && a.paused) {
      a.play().catch(() => {});
    }
  }, [paused, started]);

  // Completion: Enter advances to the next level (wraps back to L1 after L5).
  useEffect(() => {
    if (phase !== "complete") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") requestLevel(levelId < LEVELS.length ? levelId + 1 : 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, levelId, requestLevel]);

  // L4: mirror the live ribbon drift into the HUD meter (green -> red).
  useEffect(() => {
    if (!started || phase !== "ride") return;
    let raf = 0;
    const tick = () => {
      const el = rideFillRef.current;
      if (el) {
        const d = gameRef.current.drift;
        el.style.transform = `scaleX(${d})`;
        el.style.background = d > 0.6 ? "#ff2e63" : d > 0.3 ? "#ffb347" : "#00ff88";
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [started, phase]);

  // Field hit -> a screen-edge glitch flash, so you register the boundary even
  // if you strafed into a side face you are not looking at. Watches the shared
  // boundary seq and pulses the overlay's opacity (CSS eases it back out); pure
  // DOM mutation, no React state per frame.
  useEffect(() => {
    if (!started) return;
    let raf = 0;
    let seenSeq = boundaryRef.current.seq;
    const tick = () => {
      const seq = boundaryRef.current.seq;
      if (seq !== seenSeq) {
        seenSeq = seq;
        const el = flashRef.current;
        if (el) {
          el.style.transition = "none";
          el.style.opacity = "1";
          void el.offsetWidth; // reflow so the fade restarts
          el.style.transition = "opacity 480ms ease-out";
          el.style.opacity = "0";
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [started]);

  // Clear the toast after it plays.
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 1100);
    return () => window.clearTimeout(id);
  }, [toast]);

  // Cursor scrim: hide the cursor while it sits in the central ellipse, reveal it
  // once the pointer reaches the outer edges (a cursor hidden everywhere reads as
  // disorienting). Paused always shows it. Driven off raw mousemove + the root
  // ref so it never churns React state.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    let last = "";
    const apply = () => {
      const { x, y } = pointerRef.current;
      let show = paused;
      if (!show && x >= 0) {
        const halfW = window.innerWidth / 2;
        const halfH = window.innerHeight / 2;
        const nx = (x - halfW) / (halfW * CURSOR_SCRIM_RX);
        const ny = (y - halfH) / (halfH * CURSOR_SCRIM_RY);
        show = nx * nx + ny * ny > 1; // outside the ellipse = the scrim's outer edge
      }
      const next = show ? "default" : "none";
      if (next !== last) { el.style.cursor = next; last = next; }
    };
    const onMove = (e: MouseEvent) => {
      pointerRef.current = { x: e.clientX, y: e.clientY };
      apply();
    };
    window.addEventListener("mousemove", onMove);
    apply(); // reflect the current paused state right away
    return () => window.removeEventListener("mousemove", onMove);
  }, [paused]);

  // L1 "The Word": Enter to speak, type the verb, Enter to submit, Esc to step
  // back. A hint unlocks only after HINT_AFTER_TRIES wrong guesses (Tab to show).
  // typedRef/triesRef hold the live values so the handler never sees stale state.
  useEffect(() => {
    const isWord = (phase === "treadmill" || phase === "facade") && !!level.word;
    // Stage B reuses the verb-wall parser: once you reach the comfort wall and it
    // is still standing, the same input accepts its verbs (leave / walk / ...).
    const isComfort = phase === "open" && comfortNear && !comfortBroken && !!level.comfortWord;
    const isWordlike = isWord || isComfort; // a glass/comfort verb wall (vs the L5 ego climax)
    const isEgo = phase === "ego" && !!level.ego;
    if (!started || (!isWordlike && !isEgo)) return;
    const challenge = isComfort ? level.comfortWord : level.word;
    const accept = challenge?.accept ?? [];
    const egoTotal = level.ego?.layers.length ?? 0;
    const onKey = (e: KeyboardEvent) => {
      if (!typingMode) {
        if (e.key === "Enter") {
          typedRef.current = "";
          setTyped("");
          setWrongFlash(false);
          setTypingMode(true);
        }
        return;
      }
      if (e.key === "Escape") {
        // Mid-climax (considering a truth, or showing its reflection) Escape is
        // inert - you do not get to back out of the moment.
        if (isEgo && (egoThinkingRef.current || egoReflectionRef.current !== null)) return;
        setTypingMode(false);
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        if (isWordlike && triesRef.current >= HINT_AFTER_TRIES && !showHint) {
          setShowHint(true);
          track("tm_hint_used", { level: levelId, tries: triesRef.current });
        }
        return;
      }
      if (e.key === "Enter") {
        const text = typedRef.current.trim();
        if (isEgo) {
          // While the machine is considering a truth, Enter is inert.
          if (egoThinkingRef.current) return;
          // Showing a reflection: the ring already dissolved when the words
          // landed. Enter acknowledges it and moves to the next layer, or, on
          // the final layer, floods the light (or locks if the rune is missing).
          if (egoReflectionRef.current !== null) {
            const wasFinal = gameRef.current.egoDissolved >= egoTotal;
            egoReflectionRef.current = null;
            setEgoReflection(null);
            if (wasFinal) {
              setTypingMode(false);
              if (inventoryRef.current.rune) {
                pulseRef.current.charge = 1; // light flood
                setPhase("complete");
                track("tm_rune_matched", { level: levelId });
                // The journey is done: persist completion + fire the rewards.
                void postTmComplete(sessionIdRef.current).then((res) => {
                  if (res && !res.alreadyCompleted && res.couponCode) {
                    setRewardNote("A merch reward just landed in your inbox.");
                  }
                });
              } else {
                setDoorLocked(true);
              }
            }
            // Not final: the typing box reappears for the next layer.
            return;
          }
          // A fresh truth. Any non-empty text is valid (you create what frees
          // you). Opus reads what you actually wrote and reflects it back, and
          // that reflection is what dissolves the ring.
          if (text.length === 0) return;
          track("tm_truth_spoken", { level: levelId, len: text.length });
          const idx = gameRef.current.egoDissolved;
          const layerName = level.ego?.layers[idx] ?? null;
          // Log the truth to the player's account (signed-in only; fire-and-forget).
          fetch("/api/transcend/truth", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ level: levelId, layer: layerName, truth: text }),
            keepalive: true,
          }).catch(() => {});
          const prior = truthsRef.current.slice();
          truthsRef.current.push(text);
          typedRef.current = "";
          setTyped("");
          egoThinkingRef.current = true;
          setEgoThinking(true);
          // The reflection gates the dissolve. fetchClimaxReflection always
          // resolves (static fallback on failure), so the climax never stalls.
          void fetchClimaxReflection({
            level: levelId,
            layer: layerName,
            truth: text,
            index: idx,
            priorTruths: prior,
          }).then((reflection) => {
            egoThinkingRef.current = false;
            setEgoThinking(false);
            egoReflectionRef.current = reflection;
            setEgoReflection(reflection);
            gameRef.current.egoDissolved = Math.min(egoTotal, idx + 1);
            setEgoDissolved(gameRef.current.egoDissolved);
            if (gameRef.current.egoDissolved >= egoTotal) {
              finalReflectionRef.current = reflection;
              setFinalReflection(reflection);
            }
            track("tm_truth_reflected", { level: levelId, index: idx, len: reflection.length });
          });
          return;
        }
        const word = text.toLowerCase();
        const correct = accept.includes(word);
        track("tm_word_attempt", { level: levelId, word, correct, attempt: triesRef.current + 1, comfort: isComfort });
        if (correct) {
          setTypingMode(false);
          if (isComfort) {
            // The comfort wall dissolves - you didn't fight it, you walked. Drop
            // the collider, play the warm shatter, and flash the confirming line.
            setComfortBroken(true);
            setComfortBreaking(true);
            setToast(challenge?.openLine ?? null);
            track("tm_comfort_broken", { level: levelId, tries: triesRef.current });
          } else {
            gameRef.current.strikeRequested = true;
            gameRef.current.tension = 1;
            track("tm_wall_shattered", { level: levelId, tries: triesRef.current });
          }
        } else {
          triesRef.current += 1;
          setTries(triesRef.current);
          gameRef.current.tension = 1;
          setWrongFlash(true);
          typedRef.current = "";
          setTyped("");
        }
        return;
      }
      // Climax is thinking or showing a reflection: the box is gone, so swallow
      // editing keys (Enter/Escape are handled in their own branches above).
      if (isEgo && (egoThinkingRef.current || egoReflectionRef.current !== null)) return;
      if (e.key === "Backspace") {
        typedRef.current = typedRef.current.slice(0, -1);
        setTyped(typedRef.current);
        return;
      }
      const allow = isEgo
        ? e.key.length === 1 && /[a-zA-Z0-9 ,.'!?-]/.test(e.key)
        : /^[a-zA-Z]$/.test(e.key);
      if (allow) {
        e.preventDefault();
        setWrongFlash(false);
        typedRef.current = (typedRef.current + e.key).slice(0, isEgo ? 48 : 16);
        setTyped(typedRef.current);
        if (isWordlike) gameRef.current.tension = Math.min(1, 0.3 + typedRef.current.length * 0.1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [started, phase, typingMode, showHint, levelId, level.word, level.comfortWord, level.ego, comfortNear, comfortBroken]);

  const signalGot = collected.reduce((a, b) => a + (b ? 1 : 0), 0);
  const openLine = level.word?.openLine ?? level.collect?.openLine ?? null;
  // Stage B: the comfort wall shows its prompt from when you reach it until you
  // speak the verb. activeWord drives ONE verb-wall UI for both the glass wall
  // (treadmill / facade) and the comfort wall (open) - same input, same chrome.
  const comfortActive = phase === "open" && comfortNear && !comfortBroken && !!level.comfortWord;
  const wordPhaseActive = (phase === "treadmill" || phase === "facade") && !!level.word;
  const activeWord = comfortActive ? level.comfortWord : wordPhaseActive ? level.word : null;
  // Completion subline: per-level by default; on L5, the player's own closing
  // reflection takes its place when one came through.
  const completeSubline =
    level.mechanic === "ego" && finalReflection
      ? finalReflection
      : level.completeSub ?? "The loop was the lie.";

  return (
    <div ref={rootRef} className="tm-root">
      <audio ref={audioRef} loop crossOrigin="anonymous" preload="auto" />
      <div ref={flashRef} className="tm-boundary-flash" aria-hidden="true" />

      <Canvas
        flat
        frameloop={paused ? "never" : "always"}
        camera={{ fov: 75, near: 0.1, far: 600, position: [0, 0, 16] }}
        gl={{ antialias: true }}
        dpr={[1, 2]}
      >
        <color attach="background" args={["#000000"]} />
        <fogExp2 attach="fog" args={["#000000", FOG_DENSITY]} />
        <FlyCam
          colliders={activeColliders}
          phase={phase}
          started={started}
          typing={typingMode}
          gameRef={gameRef}
          pulseRef={pulseRef}
          breakInfo={breakInfo}
          signal={signal}
          hasKey={inventory.key}
          onStrike={(info) => {
            // L1's escape turns right after stretch 2 - the exit sits around the
            // corner in the side leg. Other levels keep the short straight exit.
            if (level.id === 1) {
              const ex = l1ExitPos(info.wallZ);
              setBreakInfo({ wallZ: info.wallZ, portalZ: ex.z, portalX: ex.x });
            } else {
              setBreakInfo({ wallZ: info.wallZ, portalZ: info.portalZ });
            }
            setPhase("breaking");
          }}
          onReach={() => {
            track("tm_level_complete", { level: levelId, song: level.song });
            setPhase("complete");
          }}
          onCollect={onCollect}
          onAllCollected={onAllCollected}
          onRuneReached={onRuneReached}
          onDoorLocked={onDoorLocked}
          boundaryRef={boundaryRef}
          field={activeField}
          comfortWallZ={comfortWallZ}
          onComfortNear={() => {
            // Fresh verb input at the wall: clear any tries carried from the
            // glass wall so the hint timing restarts for this challenge.
            typedRef.current = "";
            triesRef.current = 0;
            setTyped("");
            setTries(0);
            setShowHint(false);
            setWrongFlash(false);
            setComfortNear(true);
            track("tm_comfort_reached", { level: levelId });
          }}
        />
        <Scene
          key={level.id}
          level={level}
          pillars={pillars}
          reactive={activeReactive}
          skinTextureUrl={activeReactive?.skinTextureUrl ?? null}
          audioRef={audioRef}
          pulseRef={pulseRef}
          phase={phase}
          breakInfo={breakInfo}
          gameRef={gameRef}
          signal={signal}
          collected={collected}
          sirens={sirens}
          egoDissolved={egoDissolved}
          showExit={level.id !== 1 || comfortBroken}
          onShatterDone={() => setPhase("open")}
        />
        <FieldWalls field={activeField} hue={level.hue} boundaryRef={boundaryRef} />
        {escapeActive && <EscapeWalls walls={escapeWalls.main} hue={level.hue} />}
        {escapeActive && comfortBroken && <EscapeWalls walls={escapeWalls.leg} hue={level.hue} />}
        {escapeActive && breakInfo && (
          <JourneyGates wallZ={breakInfo.wallZ} hue={level.hue} gates={L1_GAUNTLET} pulseRef={pulseRef} />
        )}
        {escapeActive && comfortBroken && breakInfo && (
          <LegGates wallZ={breakInfo.wallZ} hue={level.hue} pulseRef={pulseRef} />
        )}
        {phase === "open" && comfortWallZ !== null && !comfortBroken && (
          <ComfortWall z={comfortWallZ} />
        )}
        {phase === "open" && comfortBreaking && comfortWallZ !== null && (
          <Shatter color={COMFORT_HUE} wallZ={comfortWallZ} onDone={() => setComfortBreaking(false)} />
        )}
        <BloomComposer pulseRef={pulseRef} />
      </Canvas>

      <div className="tm-scrim" aria-hidden="true" />

      <div className="tm-level">
        <div className="tm-level__stage">
          L{level.id} &middot; {level.stage}
        </div>
        <div className="tm-level__song">{level.song}</div>
        <div className="tm-charge" style={{ color: level.hue }}>
          <span>CHARGE {level.charge}</span>
          <span className="tm-charge__track">
            <span className="tm-charge__fill" style={{ width: `${level.charge}%`, background: level.hue }} />
          </span>
        </div>
        {(inventory.key || inventory.rune) && (
          <div className="tm-inv">
            {inventory.key && <span className="tm-inv__item">&#9670; KEY</span>}
            {inventory.rune && <span className="tm-inv__item">&#9670; RUNE</span>}
          </div>
        )}
      </div>

      <div className="tm-hud">
        <b>TRANSCEND THE MACHINE</b>
        <span>
          W/S move &middot; A/D strafe &middot; arrows turn &middot; Q/E up-down &middot; Enter speak &middot; 1-5 level &middot; Esc pause
        </span>
      </div>

      {started && paused && (
        <div className="tm-pause" onClick={() => setPaused(false)}>
          <div className="tm-pause__inner">
            <div className="tm-pause__title">PAUSED</div>
            <div className="tm-pause__cta">PRESS ESC TO RESUME</div>
          </div>
        </div>
      )}

      {/* Verb wall: idle prompt then the typing parser. One UI for the glass wall
          (treadmill / facade) and the comfort wall (open, gauntlet stage B). */}
      {started && activeWord && !typingMode && (
        <div className="tm-prompt">
          <div className="tm-prompt__line">{activeWord.idleLine}</div>
          <div className="tm-prompt__cta">PRESS ENTER TO SPEAK</div>
        </div>
      )}
      {started && activeWord && typingMode && (
        <div className="tm-word">
          <div className="tm-word__ask">{activeWord.prompt}</div>
          <div className="tm-word__box">
            <span className="tm-word__text">{typed.toUpperCase()}</span>
            <span className="tm-word__caret">&#9614;</span>
          </div>
          <div className="tm-word__hintline">
            {wrongFlash ? (
              <span className="tm-word__wrong">NOT THE WORD</span>
            ) : showHint ? (
              <span className="tm-word__hint">{activeWord.hint}</span>
            ) : tries >= HINT_AFTER_TRIES ? (
              <span className="tm-word__hint">TAB FOR A HINT</span>
            ) : (
              <span className="tm-word__sub">ENTER to speak it &middot; ESC to step back</span>
            )}
          </div>
        </div>
      )}
      {started && phase === "collect" && level.collect && (
        <div className="tm-prompt">
          <div className="tm-prompt__line">{level.collect.line}</div>
          <div className="tm-prompt__cta">
            SIGNAL {signalGot}/{level.collect.count}
          </div>
        </div>
      )}
      {started && phase === "ride" && level.ride && (
        <div className="tm-prompt">
          <div className="tm-prompt__line">{doorLocked ? level.ride.lockedLine : level.ride.line}</div>
          <div className="tm-ride" aria-hidden="true">
            <span ref={rideFillRef} className="tm-ride__fill" />
          </div>
        </div>
      )}
      {started && phase === "ego" && level.ego && !typingMode && (
        <div className="tm-prompt">
          <div className="tm-prompt__line">{doorLocked ? level.ego.lockedLine : level.ego.prompt}</div>
          <div className="tm-prompt__cta">
            PRESS ENTER TO SPEAK YOUR TRUTH &middot; {egoDissolved}/{level.ego.layers.length} DISSOLVED
          </div>
        </div>
      )}
      {started && phase === "ego" && level.ego && typingMode && egoThinking && (
        <div className="tm-word">
          <div className="tm-word__ask">
            CONFRONTING: {level.ego.layers[Math.min(egoDissolved, level.ego.layers.length - 1)]} PROGRAMMING
          </div>
          <div className="tm-think">
            THE MACHINE HEARS YOU<span className="tm-think__dots" aria-hidden="true" />
          </div>
        </div>
      )}
      {started && phase === "ego" && level.ego && typingMode && !egoThinking && egoReflection && (
        <div className="tm-word">
          <div className="tm-reflect">{egoReflection}</div>
          <div className="tm-word__hintline">
            <span className="tm-word__sub">PRESS ENTER TO CONTINUE</span>
          </div>
        </div>
      )}
      {started && phase === "ego" && level.ego && typingMode && !egoThinking && !egoReflection && (
        <div className="tm-word">
          <div className="tm-word__ask">
            CONFRONTING: {level.ego.layers[Math.min(egoDissolved, level.ego.layers.length - 1)]} PROGRAMMING
          </div>
          <div className="tm-word__box">
            <span className="tm-word__text">{typed.toUpperCase()}</span>
            <span className="tm-word__caret">&#9614;</span>
          </div>
          <div className="tm-word__hintline">
            <span className="tm-word__sub">TYPE YOUR OWN TRUTH &middot; ENTER to speak &middot; ESC to step back</span>
          </div>
        </div>
      )}
      {started && phase === "open" && openLine && !comfortActive && (
        <div className="tm-prompt">
          <div className="tm-prompt__cta">{openLine}</div>
        </div>
      )}

      {toast && <div className="tm-toast">{toast}</div>}

      {phase === "complete" && (
        <>
          <div className="tm-flood" aria-hidden="true" />
          <div className="tm-complete">
            <div className="tm-complete__inner">
              <div className="tm-complete__eyebrow">TRANSCENDED</div>
              <h2 className="tm-complete__title">{level.song.toUpperCase()}</h2>
              <div className="tm-complete__sub">{completeSubline}</div>
              {rewardNote && <div className="tm-complete__reward">{rewardNote}</div>}
              <div className="tm-complete__cta">PRESS ENTER TO CONTINUE</div>
            </div>
          </div>
        </>
      )}

      {accountGate !== null && (
        <div className="tm-acct">
          <div className="tm-acct__inner">
            <div className="tm-acct__eyebrow">TWO MACHINES TRANSCENDED</div>
            <h2 className="tm-acct__title">The rest remembers you</h2>
            <p className="tm-acct__body">
              Make a free account and the climb starts saving itself: your progress and everything you
              earn out here carries forward. Levels three through five open the moment you do.
            </p>
            <div className="tm-acct__actions">
              <Link
                className="tm-acct__btn tm-acct__btn--primary"
                href="/account/register?next=/transcend-spike"
                onClick={() => track("tm_account_cta", { action: "register", to_level: accountGate })}
              >
                Create a free account
              </Link>
              <Link
                className="tm-acct__btn"
                href="/account/login?next=/transcend-spike"
                onClick={() => track("tm_account_cta", { action: "login", to_level: accountGate })}
              >
                I already have one
              </Link>
            </div>
            <button
              type="button"
              className="tm-acct__dismiss"
              onClick={() => {
                track("tm_account_dismiss", { to_level: accountGate });
                setAccountGate(null);
              }}
            >
              Not yet
            </button>
          </div>
        </div>
      )}

      {!started && (
        <div className="tm-gate" onClick={wake}>
          <div className="tm-gate__inner">
            <div className="tm-gate__eyebrow">You don&apos;t escape the machine. You outgrow it.</div>
            <h1 className="tm-gate__title">TRANSCEND THE MACHINE</h1>
            <div className="tm-gate__sub">a new experience developed by The Deprogrammer</div>
            <div className="tm-gate__cta">PRESS ANY KEY TO WAKE</div>
          </div>
        </div>
      )}
    </div>
  );
}
