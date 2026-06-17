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
  buildPillars,
  buildSignal,
  buildSirens,
  EYE_HEIGHT,
  FLOOR_Y,
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
  type LevelConfig,
  type Phase,
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
const FREE_LEVELS = 2;

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

// beat_data dispatch thresholds (mirrors the visualizer's stem profile)
const KICK_THRESH = 0.32;
const KICK_FLOOR = 0.55;
const KICK_RANGE = 0.55;
const SNARE_THRESH = 0.15;
const SNARE_FLOOR = 0.55;
const SNARE_RANGE = 0.5;
const BASS_PULSE_THRESH = 0.2;
const SLOP = 0.05;

// L1 vertical-slice tuning
const WRAP_HI = 16; // treadmill keeps the player in [WRAP_HI - WRAP_LEN, WRAP_HI]
const SHATTER_DUR = 0.9; // shatter animation length
const PORTAL_BEYOND = 35; // exit portal sits this far beyond the broken wall
const PORTAL_REACH = 6; // distance to the portal that completes the level
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
type BreakInfo = { wallZ: number; portalZ: number };
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
  const SHARD_COUNT = 24;
  const initial = useMemo(() => {
    const rnd = mulberry32(Math.floor(Math.abs(wallZ) * 131) + 7);
    return Array.from({ length: SHARD_COUNT }, () => ({
      px: (rnd() - 0.5) * WALL_WIDTH,
      py: FLOOR_Y + rnd() * WALL_HEIGHT,
      pz: wallZ + (rnd() - 0.5) * 1.2,
      vx: (rnd() - 0.5) * 11,
      vy: (rnd() - 0.15) * 9,
      vz: (rnd() - 0.5) * 7,
      rx: rnd() * 6, ry: rnd() * 6, rz: rnd() * 6,
      rvx: (rnd() - 0.5) * 7, rvy: (rnd() - 0.5) * 7, rvz: (rnd() - 0.5) * 7,
      scl: 0.6 + rnd() * 1.6,
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
      m.scale.setScalar(s.scl * fade);
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
  const gridRef = useRef<THREE.GridHelper>(null);
  const groupRef = useRef<THREE.Group>(null); // scene root - swayed subtly by the warp synth
  const skinMeshRefs = useRef<(THREE.Mesh | null)[]>([]);
  const st = useRef({ kick: 0, snare: 0, bass: 0, bassPulse: 0, chord: 0, warp: 0, nextIdx: 0 });

  useFrame(({ clock }, delta) => {
    const dt = Math.min(delta, 0.05);
    const s = st.current;
    const audio = audioRef.current;

    s.kick *= Math.pow(0.5, dt / 0.11);
    s.snare *= Math.pow(0.5, dt / 0.08);
    s.bassPulse *= Math.pow(0.5, dt / 0.2);
    if (s.kick < 0.001) s.kick = 0;
    if (s.snare < 0.001) s.snare = 0;
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
        const bpv = ev.bp ?? 0;
        if (sv >= SNARE_THRESH) {
          s.snare = Math.min(1.2, Math.max(s.snare, SNARE_FLOOR + sv * SNARE_RANGE));
        } else if (kv >= KICK_THRESH) {
          s.kick = Math.min(1.2, Math.max(s.kick, KICK_FLOOR + kv * KICK_RANGE));
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
    p.bass = s.bass;
    p.bassPulse = s.bassPulse;
    p.chord = s.chord;
    p.warp = s.warp;

    // Warp synth: a very subtle whole-scene sway (the space bends as the warp
    // sound moves). Per-pillar vertex ripple is added in the skin shader below;
    // this is the gentle global component. Kept small on purpose.
    const grp = groupRef.current;
    if (grp) {
      const w = s.warp;
      grp.rotation.z = Math.sin(clock.elapsedTime * 1.3) * 0.012 * w;
      grp.position.x = Math.sin(clock.elapsedTime * 0.9) * 0.25 * w;
    }

    const grid = gridRef.current;
    if (grid) {
      const gm = grid.material as THREE.LineBasicMaterial;
      gm.transparent = true;
      gm.opacity = 0.2 + 0.55 * s.bass; // grid breathes on the bass synth
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
    <group ref={groupRef}>
      <gridHelper ref={gridRef} args={[600, 120, level.hue, "#08303a"]} position={[0, FLOOR_Y, -90]} />
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
      {(phase === "open" || phase === "complete") && breakInfo && (
        <ExitPortal hue={level.hue} portalZ={breakInfo.portalZ} />
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
}) {
  const { camera } = useThree();
  const keys = useRef<Record<string, boolean>>({});
  const yaw = useRef(0);
  const vel = useRef(new THREE.Vector3());

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
      const ox = c.hw + PLAYER_RADIUS - Math.abs(dx);
      const oz = c.hw + PLAYER_RADIUS - Math.abs(dz);
      if (ox > 0 && oz > 0) {
        if (ox < oz) {
          camera.position.setX(c.x + (dx < 0 ? -1 : 1) * (c.hw + PLAYER_RADIUS));
          v.x = 0;
        } else {
          camera.position.setZ(c.z + (dz < 0 ? -1 : 1) * (c.hw + PLAYER_RADIUS));
          v.z = 0;
        }
      }
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

    // The exit was always there: reach it to transcend.
    if (phase === "open" && breakInfo && !g.reached) {
      const dz = camera.position.z - breakInfo.portalZ;
      const dx = camera.position.x;
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
  // Account gate: L1-L2 free, L3+ needs a free account. hasAccount is read from
  // /api/auth/me; accountGate holds the level the player tried to reach gated.
  const [hasAccount, setHasAccount] = useState(false);
  const [accountGate, setAccountGate] = useState<number | null>(null);
  // L3 collect + the Journey-Key inventory (persists across levels = the chain).
  const [collected, setCollected] = useState<boolean[]>([]);
  const [inventory, setInventory] = useState<Inventory>({ key: false, rune: false });
  const [doorLocked, setDoorLocked] = useState(false); // door/match reached without the needed key
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
  const signal = useMemo(() => (level.collect ? buildSignal(levelId, level.collect.count) : []), [levelId, level.collect]);
  const sirens = useMemo(() => (level.mechanic === "ride" ? buildSirens() : []), [level.mechanic]);

  // Per-level reactive cue sheet from the server. Levels whose song row has no
  // streaming_path resolve to null and play on the ambient placeholder pulse.
  const activeReactive = levelReactive[levelId] ?? null;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pulseRef = useRef<Pulse>({ kick: 0, snare: 0, bass: 0, bassPulse: 0, charge: level.charge / 100, chord: 0, warp: 0 });
  const gameRef = useRef<GameState>({ struck: false, reached: false, tension: 0, strikeRequested: false, collected: [], collectedCount: 0, keyDone: false, drift: 0, lockedHit: false, egoDissolved: 0 });

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
      if (!resumedRef.current && target > 1 && (target <= FREE_LEVELS || account)) {
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

  // Clear the toast after it plays.
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 1100);
    return () => window.clearTimeout(id);
  }, [toast]);

  // L1 "The Word": Enter to speak, type the verb, Enter to submit, Esc to step
  // back. A hint unlocks only after HINT_AFTER_TRIES wrong guesses (Tab to show).
  // typedRef/triesRef hold the live values so the handler never sees stale state.
  useEffect(() => {
    const isWord = (phase === "treadmill" || phase === "facade") && !!level.word;
    const isEgo = phase === "ego" && !!level.ego;
    if (!started || (!isWord && !isEgo)) return;
    const accept = level.word?.accept ?? [];
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
        if (isWord && triesRef.current >= HINT_AFTER_TRIES && !showHint) {
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
        track("tm_word_attempt", { level: levelId, word, correct, attempt: triesRef.current + 1 });
        if (correct) {
          gameRef.current.strikeRequested = true;
          gameRef.current.tension = 1;
          setTypingMode(false);
          track("tm_wall_shattered", { level: levelId, tries: triesRef.current });
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
        if (isWord) gameRef.current.tension = Math.min(1, 0.3 + typedRef.current.length * 0.1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [started, phase, typingMode, showHint, levelId, level.word, level.ego]);

  const signalGot = collected.reduce((a, b) => a + (b ? 1 : 0), 0);
  const openLine = level.word?.openLine ?? level.collect?.openLine ?? null;
  // Completion subline: per-level by default; on L5, the player's own closing
  // reflection takes its place when one came through.
  const completeSubline =
    level.mechanic === "ego" && finalReflection
      ? finalReflection
      : level.completeSub ?? "The loop was the lie.";

  return (
    <div className="tm-root">
      <audio ref={audioRef} loop crossOrigin="anonymous" preload="auto" />

      <Canvas
        flat
        camera={{ fov: 75, near: 0.1, far: 600, position: [0, 0, 16] }}
        gl={{ antialias: true }}
        dpr={[1, 2]}
      >
        <color attach="background" args={["#000000"]} />
        <fogExp2 attach="fog" args={["#000000", FOG_DENSITY]} />
        <FlyCam
          colliders={colliders}
          phase={phase}
          started={started}
          typing={typingMode}
          gameRef={gameRef}
          pulseRef={pulseRef}
          breakInfo={breakInfo}
          signal={signal}
          hasKey={inventory.key}
          onStrike={(info) => {
            setBreakInfo(info);
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
          onShatterDone={() => setPhase("open")}
        />
        <BloomComposer pulseRef={pulseRef} />
      </Canvas>

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
          W/S move &middot; A/D strafe &middot; arrows turn &middot; Q/E up-down &middot; Enter speak &middot; 1-5 level
        </span>
      </div>

      {/* The Word: idle prompt, then the typing parser (treadmill + facade) */}
      {started && (phase === "treadmill" || phase === "facade") && level.word && !typingMode && (
        <div className="tm-prompt">
          <div className="tm-prompt__line">{level.word.idleLine}</div>
          <div className="tm-prompt__cta">PRESS ENTER TO SPEAK</div>
        </div>
      )}
      {started && (phase === "treadmill" || phase === "facade") && level.word && typingMode && (
        <div className="tm-word">
          <div className="tm-word__ask">{level.word.prompt}</div>
          <div className="tm-word__box">
            <span className="tm-word__text">{typed.toUpperCase()}</span>
            <span className="tm-word__caret">&#9614;</span>
          </div>
          <div className="tm-word__hintline">
            {wrongFlash ? (
              <span className="tm-word__wrong">NOT THE WORD</span>
            ) : showHint ? (
              <span className="tm-word__hint">{level.word.hint}</span>
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
      {started && phase === "open" && openLine && (
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
            <div className="tm-gate__eyebrow">THE ANTI-VR</div>
            <h1 className="tm-gate__title">TRANSCEND THE MACHINE</h1>
            <div className="tm-gate__sub">You don&apos;t escape the machine. You outgrow it.</div>
            <div className="tm-gate__cta">PRESS ANY KEY TO WAKE</div>
          </div>
        </div>
      )}
    </div>
  );
}
