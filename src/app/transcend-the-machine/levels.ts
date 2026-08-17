/* Transcend the Machine - Phase 1 level-loader data model.
 *
 * A level is a song rendered as a vector corridor. The loader builds the
 * corridor geometry + colors from a LevelConfig and (when present) wires the
 * song's real beat_data so the world pulses to the track. In Phase 1 only L1
 * (Machine) carries reactive data; L2-L5 are scaffolded with their Rising
 * Compass tier hue + charge so level-switching proves the loader. */

// ----- Corridor geometry constants (shared by builder + camera) -----
export const FLOOR_Y = -3;
// The single plane everything is played on. Flight is planar: there is no climb
// or dive, so the camera sits here for the whole run and anything the player has
// to reach has to live in this plane too (see buildSignal).
export const FLIGHT_Y = 0;
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
  to?: number; // tom -> cube position shake
  cl?: number; // clap -> particle burst
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
  tom: number; // 0..1, decays fast (cube/corridor position shake - full kit)
  clap: number; // 0..1, decays fast (rising edge fires a particle burst)
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
  comfortWord?: WordChallenge; // L1 post-shatter comfort wall (gauntlet stage B)
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
    completeSub: "The loop is a lie.",
    word: {
      accept: ["shatter", "break", "smash"],
      prompt: "THE WALL IS GLASS.\nTYPE WHAT YOU DO TO IT.",
      hint: "HINT: it is glass - say what you do to glass",
      idleLine: "YOU ARE NOT ADVANCING",
      openLine: "TIME TO LEAVE THE LOOP",
    },
    // Gauntlet stage B: the comfort wall past the slalom. You do not smash
    // comfort - you leave it. A correct verb dissolves it (warm shards).
    comfortWord: {
      accept: ["leave", "walk", "quit", "go", "rise"],
      prompt: "COMFORT WALL SAYS STAY CONFINED AND COMFY.\nTYPE WHAT YOU DO.",
      hint: "you don't break comfort - you leave it",
      idleLine: "ENCOUNTERING COMFORT WALL",
      openLine: "YOU'RE ABOUT TO BREAK THE LOOP! GO!",
    },
  },
  {
    id: 2, stage: "SEE", song: "See Through Me", slug: "see-through-me", charge: 8, tierLabel: "green", hue: "#00ff88",
    mechanic: "facade", shatterColor: "#ff2e63",
    completeSub: "Nothing was solid. You just stopped pretending it was.",
    word: {
      accept: ["see", "seethrough", "scrape", "reveal", "strip", "expose"],
      prompt: "THE FRONT SAYS I'M FINE.\nTYPE HOW YOU GET PAST IT.",
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
      // In the flight plane, jittered only enough to not read as a ruled line.
      // The spread used to be FLOOR_Y + 1.6 + rnd() * 6, which reached well above
      // COLLECT_REACH once flight went planar - about a quarter of the fragments
      // became uncollectable, and L3 needs all of them to hand over the key.
      y: FLIGHT_Y + (rnd() - 0.5) * 2,
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

// AABB colliders. The fly controller resolves the camera against these so you
// cannot pass through (unless you fly over the top). Footprints are rectangular
// (hwx in x, hwz in z) so the same model serves square pillars and the wide
// barrier gates of the post-shatter gauntlet.
// `id` marks a collider as a boundary wall slab, and names which one. Only the
// escape walls carry it: the controller uses it to fire a contact shock at the
// wall that was hit, the way the Field does on the column levels. Pillars and
// gates leave it undefined - they stop you, they do not react.
// `top` is descriptive only. Collision stopped consulting it when flight went
// planar; every collider is solid at any height, because there is no over.
export type Collider = { x: number; z: number; hwx: number; hwz: number; top: number; id?: string };

export function buildColliders(pillars: Pillar[]): Collider[] {
  return pillars.map((p) => ({ x: p.x, z: p.z, hwx: p.w * 0.5, hwz: p.w * 0.5, top: FLOOR_Y + p.h }));
}

// ----- Post-shatter gauntlet (L1) ---------------------------------------
// Once the glass shatters, the loop fights to pull you back. You weave through
// vector barrier gates - each blocks one side of the aisle, themed as a daily
// pull (alarm, commute, inbox, bills) - then hit the comfort wall. dz is the
// offset beyond the shattered wall (more negative z = further along the escape).
export type GateSide = "left" | "right";
export type JourneyGate = { dz: number; block: GateSide; label: string };

export const GATE_AISLE = 7; // a gate's blocked half reaches out to here in x
export const GATE_TOP = FLOOR_Y + 30; // near-ceiling: you weave around, not over
export const GATE_HWZ = 0.8; // gate thickness in z

// L1 stretch 1: four pulls, alternating sides -> a slalom.
export const L1_GAUNTLET: JourneyGate[] = [
  { dz: -16, block: "right", label: "ALARM" },
  { dz: -30, block: "left", label: "COMMUTE" },
  { dz: -44, block: "right", label: "INBOX" },
  { dz: -58, block: "left", label: "BILLS" },
];
// The comfort wall (second verb wall) sits just past the last pull. Unlike the
// slalom gates you weave around, it spans the whole aisle floor-to-ceiling - the
// only way past is to speak the verb. Stretch 2 + the finish run beyond it.
export const L1_COMFORT_DZ = -74;

// L1 stretch 2 lives in the side LEG - the ending run AFTER the turn. The workday
// grinds on as a +x slalom: each gate blocks the near or far half of the leg's
// depth, so you weave as you fly out to the exit. Hidden behind the comfort wall
// until you break through and round the corner. Swap labels freely.
export type LegGate = { dx: number; block: "near" | "far"; label: string };
export const L1_LEG_GATES: LegGate[] = [
  { dx: 11, block: "near", label: "MEETINGS" },
  { dx: 24, block: "far", label: "DEADLINES" },
  { dx: 37, block: "near", label: "OVERTIME" },
  { dx: 50, block: "far", label: "TRAFFIC" },
];

// The escape corridor turns RIGHT immediately behind the comfort wall (the second
// gate). The main corridor dead-ends just past it; the side leg is the ending run,
// holding stretch 2 + the exit, all boxed by real walls (start cap behind spawn,
// finish cap past the exit). These replace the invisible Field during L1's open phase.
export const CORRIDOR_HW = 8; // main corridor half-width (walls sit at +/- this)
export const ESCAPE_WALL_HW = 0.6; // wall slab thickness (half)
export const ESCAPE_TOP = FLOOR_Y + 36; // taller than the ceiling - cannot fly over
export const L1_START_Z = 22; // start cap, just behind spawn (z = 16)
export const L1_TURN_DZ = -90; // turn cap, just past the comfort wall (-74)
export const L1_LEG_W = 16; // leg depth in z; the leg's near wall lands at the comfort wall
export const L1_LEG_LEN = 62; // how far the leg reaches in +x (room for stretch 2 + the exit)
export const L1_EXIT_INSET = 6; // exit sits this far in from the leg's end cap
export const LEG_GATE_BLOCK_Z = L1_LEG_W / 2; // a leg gate blocks this much of the leg depth

// Comfort-wall footprint: full aisle width, taller than the Field ceiling
// (FLOOR_Y + 34) so you cannot fly over it - you must dissolve it by speaking.
export const COMFORT_WALL_ID = "comfort-wall"; // collider id -> the wall that ripples
export const COMFORT_HALF_W = WALL_WIDTH / 2; // spans the aisle, like the glass wall
export const COMFORT_HWZ = 1.0;
export const COMFORT_TOP = FLOOR_Y + 36;

// Rectangular colliders for the gauntlet gates, placed relative to the shattered
// wall's z. A "right" gate blocks x in [0, GATE_AISLE]; the gap is the left half.
export function buildGateColliders(gates: JourneyGate[], wallZ: number): Collider[] {
  return gates.map((g) => {
    const hwx = GATE_AISLE / 2;
    const cx = g.block === "right" ? hwx : -hwx;
    return { x: cx, z: wallZ + g.dz, hwx, hwz: GATE_HWZ, top: GATE_TOP };
  });
}

// The comfort wall's collider: a full-aisle, near-ceiling barrier at L1_COMFORT_DZ.
// Joins the collider set during the escape run until the verb dissolves it.
export function buildComfortCollider(wallZ: number): Collider {
  // Carries an id like the escape walls do, so running into it fires a contact
  // shock. It is the one obstacle you are meant to press against rather than
  // weave around, which is exactly when a wall should push back.
  return { id: COMFORT_WALL_ID, x: 0, z: wallZ + L1_COMFORT_DZ, hwx: COMFORT_HALF_W, hwz: COMFORT_HWZ, top: COMFORT_TOP };
}

// ----- Escape-corridor walls (L1 open phase) ----------------------------
// A wall segment is an axis-aligned vertical slab, thin along `axis` (its normal)
// and spanning [from, to] along its tangent. axis "z" => a cross wall (spans x);
// axis "x" => a side wall (spans z). The same list drives both the colliders and
// the visible vector meshes, so they can never drift apart.
// `id` is stable across the main/leg split so a contact on either group resolves
// to exactly one slab (a bare array index would collide between the two groups).
export type WallSeg = { axis: "x" | "z"; c: number; from: number; to: number; top: number; id: string };

// Build the boxed route relative to the shattered wall, split into the MAIN
// corridor (always visible during the escape) and the LEG (the ending run, hidden
// behind the comfort wall until you break through). The main corridor dead-ends at
// the turn cap just past the comfort wall; the right wall stops short to open the
// doorway into the leg; the leg is capped at its far end (behind the exit).
export function buildEscapeWalls(wallZ: number): { main: WallSeg[]; leg: WallSeg[] } {
  const turnZ = wallZ + L1_TURN_DZ; // dead-end of the main corridor
  const legNearZ = turnZ + L1_LEG_W; // near side of the leg (the doorway's near edge)
  const legEndX = CORRIDOR_HW + L1_LEG_LEN; // far end (finish cap) of the leg
  const top = ESCAPE_TOP;
  const main: WallSeg[] = [
    { id: "start-cap", axis: "z", c: L1_START_Z, from: -CORRIDOR_HW, to: CORRIDOR_HW, top }, // start cap (behind spawn)
    { id: "main-left", axis: "x", c: -CORRIDOR_HW, from: turnZ, to: L1_START_Z, top }, // main left wall
    { id: "main-right", axis: "x", c: CORRIDOR_HW, from: legNearZ, to: L1_START_Z, top }, // main right wall (stops at the doorway)
    { id: "turn-cap", axis: "z", c: turnZ, from: -CORRIDOR_HW, to: CORRIDOR_HW, top }, // main corridor dead-end cap
  ];
  const leg: WallSeg[] = [
    { id: "leg-far", axis: "z", c: turnZ, from: CORRIDOR_HW, to: legEndX, top }, // leg far wall (continues the cap)
    { id: "leg-near", axis: "z", c: legNearZ, from: CORRIDOR_HW, to: legEndX, top }, // leg near wall
    { id: "finish-cap", axis: "x", c: legEndX, from: turnZ, to: legNearZ, top }, // finish cap (behind the exit)
  ];
  return { main, leg };
}

export function buildEscapeColliders(walls: WallSeg[]): Collider[] {
  return walls.map((w) => {
    const mid = (w.from + w.to) / 2;
    const halfLen = Math.abs(w.to - w.from) / 2;
    return w.axis === "z"
      ? { x: mid, z: w.c, hwx: halfLen, hwz: ESCAPE_WALL_HW, top: w.top, id: w.id }
      : { x: w.c, z: mid, hwx: ESCAPE_WALL_HW, hwz: halfLen, top: w.top, id: w.id };
  });
}

// The escape route spans z from the dead-end cap to the start cap, and the side
// leg lives inside that span. The pillar field does not: it is built out to
// ROWS * GAP regardless, so columns kept marching past the cap to the horizon and
// the corridor read as endless even though the cap stops you a few units in.
// Clip the field to the route so the world ends where the player does. The
// clipped set is also what collides during the escape, so nothing left on screen
// is something you can walk through.
export function clipPillarsToEscape(pillars: Pillar[], wallZ: number): Pillar[] {
  const turnZ = wallZ + L1_TURN_DZ;
  return pillars.filter((p) => {
    const hw = p.w / 2;
    return p.z + hw >= turnZ && p.z - hw <= L1_START_Z;
  });
}

// Colliders for the leg's stretch-2 slalom: each gate blocks the near or far half
// of the leg's depth (thin in x, you fly +x past them), full height.
export function buildLegGateColliders(wallZ: number): Collider[] {
  const turnZ = wallZ + L1_TURN_DZ;
  const legCz = turnZ + L1_LEG_W / 2; // the leg's centerline in z
  const legNearZ = turnZ + L1_LEG_W;
  return L1_LEG_GATES.map((g) => {
    const x = CORRIDOR_HW + g.dx;
    const z = g.block === "near" ? (legCz + legNearZ) / 2 : (turnZ + legCz) / 2;
    return { x, z, hwx: GATE_HWZ, hwz: LEG_GATE_BLOCK_Z / 2, top: GATE_TOP };
  });
}

// The exit portal sits at the far end of the side leg (centered in its depth),
// inset from the end cap.
export function l1ExitPos(wallZ: number): { x: number; z: number } {
  const turnZ = wallZ + L1_TURN_DZ;
  return { x: CORRIDOR_HW + L1_LEG_LEN - L1_EXIT_INSET, z: turnZ + L1_LEG_W / 2 };
}
