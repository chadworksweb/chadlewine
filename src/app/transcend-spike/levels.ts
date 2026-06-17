/* Transcend the Machine - Phase 1 level-loader data model.
 *
 * A level is a song rendered as a vector corridor. The loader builds the
 * corridor geometry + colors from a LevelConfig and (when present) wires the
 * song's real beat_data so the world pulses to the track. In Phase 1 only L1
 * (Machine) carries reactive data; L2-L5 are scaffolded with their Rising
 * Compass tier hue + charge so level-switching proves the loader. */

// ----- Corridor geometry constants (shared by builder + camera) -----
export const FLOOR_Y = -3;
export const EYE_HEIGHT = 1.4; // camera sits this far above the floor
export const ROWS = 30;
export const GAP = 8.5;
export const AISLE = 8;
export const RUNE_Z = -ROWS * GAP - 24;
export const FOG_DENSITY = 0.014;

// L1 treadmill: the corridor repeats every UNIT_ROWS, so wrapping the player by
// WRAP_LEN is seamless - you fly forward forever and never advance (the 9-5).
export const UNIT_ROWS = 8;
export const WRAP_LEN = UNIT_ROWS * GAP; // 68
// The false wall hovers this far ahead through the whole treadmill - you can
// neither reach it nor outrun it. The only way past is to strike it.
export const WALL_AHEAD = 20;
export const WALL_WIDTH = 22; // spans the aisle wall-to-wall
export const WALL_HEIGHT = 24;

// ----- Reactive cue sheet for a level (mirrors songs.* columns) -----
export type BeatEvent = {
  at: number; // seconds in the stem timeline
  k?: number; // kick   -> pillar throb
  s?: number; // snare  -> rune / accent strobe
  h?: number; // hat
  to?: number; // tom
  bp?: number; // bass pulse -> void brightness pump
  bs?: number; // bass synth -> grid breathe (discrete fallback)
};

// Extra continuous synth-envelope channels (beyond the fixed kit + bass-synth),
// keyed by channel name. The game wires "chord" -> harmonic glow and "warp" ->
// spatial warp; a song supplies whichever its instrumentation has.
export type SynthEnvelope = { env: number[]; hz: number };

export type ReactiveData = {
  streamingUrl: string | null;
  skinTextureUrl: string | null;
  beatData: BeatEvent[] | null;
  beatOffset: number;
  bassSynthEnvelope: number[] | null;
  bassSynthEnvelopeHz: number | null;
  synthEnvelopes: Record<string, SynthEnvelope> | null;
};

// ----- Per-frame pulse envelope, written by the dispatcher, read by the
// scene materials + the bloom composer. ----------------------------------
export type Pulse = {
  kick: number; // 0..1, decays fast
  snare: number; // 0..1, decays fast
  bass: number; // 0..1, continuous bass-synth envelope (grid breathe)
  bassPulse: number; // 0..1, decays slow (void brightness)
  charge: number; // 0..1, active level charge (ambient brightness floor)
  chord: number; // 0..1, continuous "chord" synth envelope (harmonic glow)
  warp: number; // 0..1, continuous "warp" synth envelope (spatial warp)
};

// Per-level state machine. Levels with no built mechanic stay "explore".
//   blocker (treadmill | facade) -> (speak The Word) -> breaking
//     -> (shatter done) -> open -> (reach the exit) -> complete
export type Phase = "treadmill" | "facade" | "collect" | "ride" | "ego" | "breaking" | "open" | "complete" | "explore";

// A level's mechanic. "treadmill" = L1 (loops, you never advance); "facade" =
// L2 (a glossy front you see past); "collect" = L3 (gather the signal, assemble
// the KEY); "ride" = L4 (ride the waveform through the void; the key opens the
// door to the RUNE); "ego" = L5 (mirror-self boss: type your own truths to
// dissolve the programming, then match the rune); null = not yet built.
export type Mechanic = "treadmill" | "facade" | "collect" | "ride" | "ego" | null;

// The Word challenge for a level: type the verb to act. Shared input model.
export type WordChallenge = {
  accept: string[]; // accepted answers, lowercase
  prompt: string; // the ask shown above the input
  hint: string; // shown after HINT_AFTER_TRIES wrong guesses
  idleLine: string; // line shown before you start speaking
  openLine: string; // shown once the way is open (fly to the exit)
};

// The collect challenge for a level: gather N fragments, then the way opens.
export type CollectChallenge = {
  count: number; // how many signal fragments to gather
  line: string; // shown while gathering
  openLine: string; // shown once the key is assembled
};

// The ride challenge for a level: fly the waveform to the door at the end.
export type RideChallenge = {
  line: string; // shown while riding
  lockedLine: string; // shown at the door without the key
};

// The ego challenge (L5): type your own truths to dissolve the programming
// layers, then match the rune. The truth is free text (any non-empty) - the
// player creates the thing that frees them. Static affirmation now; Opus later.
export type EgoChallenge = {
  layers: string[]; // programming layers to dissolve, outer-first
  prompt: string; // the ask above the input
  lockedLine: string; // shown if the programming is gone but you lack the rune
};

export type LevelConfig = {
  id: number; // 1..5
  stage: string; // WAKE / SEE / KEY / DOOR / EGO
  song: string; // display title
  slug: string; // song slug
  charge: number; // Rising Compass charge
  tierLabel: string; // violet / green / blue
  hue: string; // accent line + rune color (per-level RC tier color)
  mechanic: Mechanic;
  shatterColor: string; // shard color when the blocker breaks
  completeSub?: string; // subline on the completion card (L5 prefers the player's own closing reflection)
  word?: WordChallenge; // present for "treadmill" / "facade" levels
  collect?: CollectChallenge; // present for "collect" levels
  ride?: RideChallenge; // present for "ride" levels
  ego?: EgoChallenge; // present for "ego" levels
};

// The five levels, ordered by play (Machine frames + opens, Finding Freedom
// closes). hue = the song's Rising Compass tier color. Slugs for L2-L5 are
// placeholders until their reactive data is wired in a later phase.
export const LEVELS: LevelConfig[] = [
  {
    id: 1, stage: "WAKE", song: "Machine", slug: "machine", charge: 76, tierLabel: "violet", hue: "#b46bff",
    mechanic: "treadmill", shatterColor: "#b46bff",
    completeSub: "The loop was the lie.",
    word: {
      accept: ["shatter", "break", "smash"],
      prompt: "THE WALL IS GLASS. TYPE WHAT YOU DO TO IT.",
      hint: "HINT: it is glass - say what you do to glass",
      idleLine: "YOU ARE NOT ADVANCING",
      openLine: "THE EXIT WAS ALWAYS THERE - FLY INTO THE LIGHT",
    },
  },
  {
    id: 2, stage: "SEE", song: "See Through Me", slug: "see-through-me", charge: 8, tierLabel: "green", hue: "#00ff88",
    mechanic: "facade", shatterColor: "#ff2e63",
    completeSub: "Nothing was solid. You just stopped pretending it was.",
    word: {
      accept: ["see", "seethrough", "scrape", "reveal", "strip", "expose"],
      prompt: "THE FRONT SAYS I'M FINE. TYPE HOW YOU GET PAST IT.",
      hint: "HINT: stop looking AT it - you SEE through it",
      idleLine: "THE FRONT SAYS YOU'RE FINE",
      openLine: "THE PATH WAS BEHIND THE FRONT - FLY THROUGH",
    },
  },
  {
    id: 3, stage: "KEY", song: "I Got The Key", slug: "i-got-the-key", charge: 14, tierLabel: "green", hue: "#3dff9e",
    mechanic: "collect", shatterColor: "#3dff9e",
    completeSub: "You were holding it the whole walk.",
    collect: {
      count: 6,
      line: "GATHER THE SIGNAL - DON'T LET IT SCROLL PAST",
      openLine: "YOU HAVE THE KEY - FLY TO THE EXIT",
    },
  },
  {
    id: 4, stage: "DOOR", song: "Everything I Need", slug: "everything-i-need", charge: 76, tierLabel: "violet", hue: "#b46bff",
    mechanic: "ride", shatterColor: "#b46bff",
    completeSub: "The sirens were never the current. You were.",
    ride: {
      line: "RIDE THE WAVEFORM - STAY CENTERED, THE SIRENS PULL",
      lockedLine: "THE DOOR IS LOCKED - YOU NEED THE KEY (LEVEL 3)",
    },
  },
  {
    id: 5, stage: "EGO", song: "Finding Freedom", slug: "finding-freedom", charge: 38, tierLabel: "blue", hue: "#00e0ff",
    mechanic: "ego", shatterColor: "#00e0ff",
    completeSub: "No one handed you this. You wrote it.",
    ego: {
      layers: ["FAMILIAL", "SOCIAL", "RELIGIOUS", "IDENTITY", "CONSUMERIST"],
      prompt: "TRANSCEND THE EGO - TYPE A TRUTH OF YOUR OWN",
      lockedLine: "THE RUNE COMPLETES THE MATCH - YOU NEED IT (LEVEL 4)",
    },
  },
];

export function levelById(id: number): LevelConfig {
  return LEVELS.find((l) => l.id === id) ?? LEVELS[0];
}

// Starting phase for a level: its mechanic, or free-explore if not yet built.
export function startPhaseFor(level: LevelConfig): Phase {
  if (level.mechanic === "treadmill") return "treadmill";
  if (level.mechanic === "facade") return "facade";
  if (level.mechanic === "collect") return "collect";
  if (level.mechanic === "ride") return "ride";
  if (level.mechanic === "ego") return "ego";
  return "explore";
}

// ----- L4 waveform-ride path -----
export const RIDE_END = 150; // you ride to z = -RIDE_END, where the door/rune is
export const RIDE_AMP = 6; // how far the waveform sways in x
export const RIDE_FREQ = 0.05; // sway frequency along z
// The ribbon centerline x at a given z. Drift off it and the sirens pull harder.
export function ridePathX(z: number): number {
  return RIDE_AMP * Math.sin(z * RIDE_FREQ);
}
export type Siren = { x: number; z: number };
export function buildSirens(): Siren[] {
  const out: Siren[] = [];
  for (let i = 1; i <= 4; i++) {
    const z = -i * (RIDE_END / 5);
    const side = i % 2 === 0 ? 1 : -1;
    out.push({ x: ridePathX(z) + side * 12, z }); // off to the side of the ribbon
  }
  return out;
}

// Signal fragments for a collect level, spread down the corridor (deterministic).
export type Signal = { x: number; y: number; z: number };
export function buildSignal(levelId: number, count: number): Signal[] {
  const rnd = mulberry32(levelId * 50021 + 91);
  const out: Signal[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      x: (rnd() - 0.5) * (AISLE * 1.6),
      y: FLOOR_Y + 1.6 + rnd() * 6,
      z: -10 - i * 14 - rnd() * 6,
    });
  }
  return out;
}

// ----- Corridor builder --------------------------------------------------
export type Pillar = {
  x: number;
  z: number;
  h: number;
  w: number; // footprint width (box scale in x and z)
  accent: boolean; // tinted with the level hue
  skin: boolean; // wears a glitch art panel inside the wireframe
  glitchId: number; // 1..4, picks the glitch archetype on the skin shader
};

// Deterministic per-level PRNG so a level's layout is stable across re-renders
// and identical every time it loads (the loader is pure: same id -> same world).
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// When `periodic` (L1), each row is seeded by (row mod UNIT_ROWS) so the layout
// repeats every UNIT_ROWS - the treadmill can wrap the player by WRAP_LEN with
// no visible seam. The door/accent/stub patterns are all keyed mod UNIT_ROWS so
// they stay periodic too. Non-periodic levels key everything by the raw row.
export function buildPillars(levelId: number, periodic = false): Pillar[] {
  const out: Pillar[] = [];
  for (let i = 0; i < ROWS; i++) {
    const z = -i * GAP;
    const key = periodic ? i % UNIT_ROWS : i;
    const rnd = mulberry32(levelId * 100003 + key * 9176 + 17);
    const leftDoor = key % 8 === 4; // wall gaps read as doorways
    const rightDoor = key % 8 === 0 && i > 0;
    if (!leftDoor) {
      const accent = key % 8 === 5;
      out.push({
        x: -(AISLE + rnd() * 1.5),
        z,
        h: 11 + rnd() * 12,
        w: 1.6 + rnd() * 1.2,
        accent,
        skin: accent,
        glitchId: 1 + Math.floor(rnd() * 4),
      });
    }
    if (!rightDoor) {
      const accent = key % 8 === 1;
      out.push({
        x: AISLE + rnd() * 1.5,
        z,
        h: 11 + rnd() * 12,
        w: 1.6 + rnd() * 1.2,
        accent,
        skin: accent,
        glitchId: 1 + Math.floor(rnd() * 4),
      });
    }
    if (key % 8 === 2 || key % 8 === 7) {
      out.push({ x: -3, z, h: 1.6, w: 2, accent: false, skin: false, glitchId: 1 });
      out.push({ x: 3, z, h: 1.6, w: 2, accent: false, skin: false, glitchId: 1 });
    }
  }
  return out;
}

// AABB colliders derived from the pillar footprints. The fly controller
// resolves the camera against these so you cannot pass through a pillar
// (unless you fly over its top).
export type Collider = { x: number; z: number; hw: number; top: number };

export function buildColliders(pillars: Pillar[]): Collider[] {
  return pillars.map((p) => ({ x: p.x, z: p.z, hw: p.w * 0.5, top: FLOOR_Y + p.h }));
}
