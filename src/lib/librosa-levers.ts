/**
 * Librosa lever registry — the single source of truth for every tunable
 * knob in the cube-visualizer pipeline. Drives:
 *   - the admin forms (controls are rendered from this list)
 *   - DEFAULT_CONFIG (the baked-in defaults, == today's hardcoded values)
 *   - the merge that produces a song's effective config
 *
 * TWO TUNING PROFILES (the effects are shared; only the TRIGGER tuning is
 * split, because the two data systems are different in kind):
 *   - "default": frequency-based cubes (HPSS bands on the mixed master).
 *     One shared profile, dialed in globally.
 *   - "stem":    stem-based cubes (isolated-stem onsets in beat_data). Each
 *     song has a unique stem set, so these are tuned per song.
 * A song uses the "stem" profile iff it has beat_data; otherwise "default".
 *
 * Lever GROUPS (orthogonal to profile):
 *   - "analyzer": fed to the Python scan. Changing one + re-scanning
 *     regenerates the stored data.
 *   - "render": read live by CubeVisualizer at playback. No re-scan.
 *
 * IMPORTANT: every `default` below must match the corresponding hardcoded
 * constant (CubeVisualizer.tsx / analyze_*.py) exactly, so a song with no
 * overrides and an empty profile behaves identically to the original.
 */

export type LeverGroup = "analyzer" | "render";
export type LeverType = "number";
export type LibrosaProfile = "default" | "stem";

export interface Lever {
  /** Stable key used in stored config + override JSON. Never rename. */
  id: string;
  label: string;
  group: LeverGroup;
  /** Which tuning profiles this lever is meaningful for. */
  profiles: LibrosaProfile[];
  /** UI sub-grouping within a group (e.g. "Kick", "Snare", "HPSS"). */
  section: string;
  type: LeverType;
  default: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  /** True for analyzer levers: editing requires a re-scan to take effect. */
  requiresRescan: boolean;
  description: string;
}

const BOTH: LibrosaProfile[] = ["default", "stem"];
const DEFAULT_ONLY: LibrosaProfile[] = ["default"];
const STEM_ONLY: LibrosaProfile[] = ["stem"];

export const LEVERS: Lever[] = [
  // ----- ANALYZER: load / separation -------------------------------------
  {
    id: "sample_rate", label: "Sample rate", group: "analyzer", profiles: BOTH, section: "Load",
    type: "number", default: 22050, min: 11025, max: 44100, step: 11025, unit: "Hz",
    requiresRescan: true,
    description: "Mono load rate. 22050 halves analysis time vs 44100 with no beat-tracking loss.",
  },
  {
    id: "hpss_margin_harmonic", label: "HPSS harmonic margin", group: "analyzer", profiles: DEFAULT_ONLY, section: "HPSS",
    type: "number", default: 1.0, min: 1.0, max: 8.0, step: 0.5,
    requiresRescan: true,
    description: "Harmonic-stem separation strength. Higher pushes more sustained content out of the percussive stem.",
  },
  {
    id: "hpss_margin_percussive", label: "HPSS percussive margin", group: "analyzer", profiles: DEFAULT_ONLY, section: "HPSS",
    type: "number", default: 5.0, min: 1.0, max: 8.0, step: 0.5,
    requiresRescan: true,
    description: "Percussive-stem isolation. 5.0 strips most vocal energy out of the kick/snare bands; default librosa is 1.0.",
  },
  // ----- ANALYZER: bands (frequency / default profile) -------------------
  {
    id: "kick_band_low", label: "Kick band low", group: "analyzer", profiles: DEFAULT_ONLY, section: "Kick band",
    type: "number", default: 30, min: 10, max: 120, step: 5, unit: "Hz",
    requiresRescan: true,
    description: "Below this is mostly room rumble + subsonic.",
  },
  {
    id: "kick_band_high", label: "Kick band high", group: "analyzer", profiles: DEFAULT_ONLY, section: "Kick band",
    type: "number", default: 130, min: 80, max: 250, step: 5, unit: "Hz",
    requiresRescan: true,
    description: "Above this starts catching snare shells.",
  },
  {
    id: "snare_band_low", label: "Snare band low", group: "analyzer", profiles: DEFAULT_ONLY, section: "Snare band",
    type: "number", default: 200, min: 100, max: 400, step: 10, unit: "Hz",
    requiresRescan: true,
    description: "Snare body fundamentals sit around 200-400 Hz.",
  },
  {
    id: "snare_band_high", label: "Snare band high", group: "analyzer", profiles: DEFAULT_ONLY, section: "Snare band",
    type: "number", default: 450, min: 300, max: 800, step: 10, unit: "Hz",
    requiresRescan: true,
    description: "Upper snare-body bound; staying below the 2-6 kHz crack avoids hi-hat bleed.",
  },
  {
    id: "norm_percentile", label: "Normalization percentile", group: "analyzer", profiles: BOTH, section: "Normalize",
    type: "number", default: 95, min: 80, max: 100, step: 1, unit: "pct",
    requiresRescan: true,
    description: "Per-song normalization ceiling. 95 lets the top ~5% clip at 1.0 and spreads the meaningful range across 0.4-1.0.",
  },
  // ----- ANALYZER: stems (stem profile) ----------------------------------
  {
    id: "bass_synth_onset_delta", label: "Bass-synth onset delta", group: "analyzer", profiles: STEM_ONLY, section: "Bass synth",
    type: "number", default: 0.02, min: 0.005, max: 0.2, step: 0.005,
    requiresRescan: true,
    description: "Peak-pick threshold for bass-synth note detection. Lower catches individual chord changes, not just big swells.",
  },
  {
    id: "envelope_hz", label: "Envelope sample rate", group: "analyzer", profiles: STEM_ONLY, section: "Bass synth",
    type: "number", default: 20, min: 5, max: 50, step: 1, unit: "Hz",
    requiresRescan: true,
    description: "Continuous bass-synth RMS envelope resolution. 20 Hz = 50ms frames.",
  },
  {
    id: "bass_synth_pitch_midi_min", label: "Pitch range low", group: "analyzer", profiles: STEM_ONLY, section: "Bass synth",
    type: "number", default: 24, min: 12, max: 60, step: 1, unit: "midi",
    requiresRescan: true,
    description: "Lowest tracked pitch (MIDI note). 24 = C1 (~33 Hz). Analyzer converts to Hz via midi_to_hz.",
  },
  {
    id: "bass_synth_pitch_midi_max", label: "Pitch range high", group: "analyzer", profiles: STEM_ONLY, section: "Bass synth",
    type: "number", default: 72, min: 48, max: 96, step: 1, unit: "midi",
    requiresRescan: true,
    description: "Highest tracked pitch (MIDI note). 72 = C5 (~523 Hz).",
  },

  // ----- RENDER: kick (both profiles) ------------------------------------
  {
    id: "kick_thresh", label: "Kick threshold", group: "render", profiles: BOTH, section: "Kick",
    type: "number", default: 0.32, min: 0, max: 1, step: 0.01,
    requiresRescan: false,
    description: "Beats with kick-band energy below this are skipped (snare/hat/ghost notes) so the cube reacts to real kicks only.",
  },
  {
    id: "kick_intensity_floor", label: "Kick intensity floor", group: "render", profiles: BOTH, section: "Kick",
    type: "number", default: 0.65, min: 0, max: 2, step: 0.05,
    requiresRescan: false,
    description: "Bottom of the kick morph intensity scaling range.",
  },
  {
    id: "kick_intensity_range", label: "Kick intensity range", group: "render", profiles: BOTH, section: "Kick",
    type: "number", default: 0.95, min: 0, max: 2, step: 0.05,
    requiresRescan: false,
    description: "Span added above the floor; a peak kick drives floor + range intensity (clamped by the mesh at 1.7).",
  },
  // ----- RENDER: snare (both profiles) -----------------------------------
  {
    id: "snare_thresh", label: "Snare threshold", group: "render", profiles: BOTH, section: "Snare",
    type: "number", default: 0.15, min: 0, max: 1, step: 0.01,
    requiresRescan: false,
    description: "Minimum snare-band onset to fire the corner strobe. On the default (frequency) profile this is a floor; the strobe also requires the snare band to exceed the kick band on that beat.",
  },
  {
    id: "snare_intensity_floor", label: "Snare intensity floor", group: "render", profiles: BOTH, section: "Snare",
    type: "number", default: 0.55, min: 0, max: 2, step: 0.05,
    requiresRescan: false,
    description: "Snare strobe peak baseline.",
  },
  {
    id: "snare_intensity_range", label: "Snare intensity range", group: "render", profiles: BOTH, section: "Snare",
    type: "number", default: 0.55, min: 0, max: 2, step: 0.05,
    requiresRescan: false,
    description: "Snare strobe peak intensity span above the floor.",
  },
  {
    id: "snare_dominance_margin", label: "Snare dominance margin", group: "render", profiles: DEFAULT_ONLY, section: "Snare",
    type: "number", default: 0, min: 0, max: 1, step: 0.01,
    requiresRescan: false,
    description: "Frequency cubes only. The snare strobe fires only when the snare band beats the kick band by at least this margin. 0 = any tie strobes (over-fires on snare-hot songs); raise to make the strobe lock to clear backbeats and let kick morphs through.",
  },
  // ----- RENDER: hat / tom / bass (stem profile only — no HPSS data) -----
  {
    id: "hat_thresh", label: "Hat threshold", group: "render", profiles: STEM_ONLY, section: "Hat",
    type: "number", default: 0.18, min: 0, max: 1, step: 0.01,
    requiresRescan: false,
    description: "Minimum hat energy to advance the dash-trail pen across the cube surface. Stem cubes only.",
  },
  {
    id: "tom_thresh", label: "Tom threshold", group: "render", profiles: STEM_ONLY, section: "Tom & Bass",
    type: "number", default: 0.20, min: 0, max: 1, step: 0.01,
    requiresRescan: false,
    description: "Minimum tom energy to fire the cube position shake. Stem cubes only.",
  },
  {
    id: "bass_pulse_thresh", label: "Bass-pulse threshold", group: "render", profiles: STEM_ONLY, section: "Tom & Bass",
    type: "number", default: 0.20, min: 0, max: 1, step: 0.01,
    requiresRescan: false,
    description: "Minimum bass-pulse energy to fire the breathing scale boost. Stem cubes only.",
  },
  {
    id: "bass_synth_thresh", label: "Bass-synth threshold", group: "render", profiles: STEM_ONLY, section: "Tom & Bass",
    type: "number", default: 0.15, min: 0, max: 1, step: 0.01,
    requiresRescan: false,
    description: "Discrete bass-synth attack threshold (fallback when no continuous envelope is present). Stem cubes only.",
  },
  {
    id: "bass_synth_env_gate", label: "Envelope gate", group: "render", profiles: STEM_ONLY, section: "Tom & Bass",
    type: "number", default: 0, min: 0, max: 1, step: 0.01,
    requiresRescan: false,
    description: "Gate threshold for the continuous envelope. 0 = raw pass-through; raise to gate quiet sections out. Stem cubes only.",
  },
  {
    id: "bass_synth_env_curve", label: "Envelope curve", group: "render", profiles: STEM_ONLY, section: "Tom & Bass",
    type: "number", default: 1, min: 1, max: 4, step: 0.1,
    requiresRescan: false,
    description: "Power curve on the envelope. 1 = linear; higher crushes the noise floor and emphasizes peaks. Stem cubes only.",
  },
  {
    id: "bass_synth_smoothing_ms", label: "Envelope smoothing", group: "render", profiles: STEM_ONLY, section: "Tom & Bass",
    type: "number", default: 400, min: 0, max: 2000, step: 50, unit: "ms",
    requiresRescan: false,
    description: "Low-pass time constant on the envelope readout. Higher = smoother, slower, more ambient. Stem cubes only.",
  },
];

/** Effective config keyed by lever id. */
export type LibrosaConfig = Record<string, number>;

/** Baked-in defaults — exactly today's hardcoded values. */
export const DEFAULT_CONFIG: LibrosaConfig = Object.fromEntries(
  LEVERS.map((l) => [l.id, l.default]),
);

export const ANALYZER_LEVERS = LEVERS.filter((l) => l.group === "analyzer");
export const RENDER_LEVERS = LEVERS.filter((l) => l.group === "render");

const LEVER_BY_ID = new Map(LEVERS.map((l) => [l.id, l]));

/** Which profile a song belongs to. Stem-analyzed (beat_data) songs are
 *  tuned per song; everything else uses the shared default profile. */
export function profileForSong(hasStems: boolean): LibrosaProfile {
  return hasStems ? "stem" : "default";
}

/** Levers relevant to a profile, filtered from a base list. */
export function leversForProfile(levers: Lever[], profile: LibrosaProfile): Lever[] {
  return levers.filter((l) => l.profiles.includes(profile));
}

/**
 * Pull one profile's sparse config out of a stored librosa_settings.config
 * object. Shape is { default: {...}, stem: {...} }. A legacy flat object
 * (lever ids at the top level) is treated as the "default" profile.
 */
export function profileFromStored(
  stored: Record<string, unknown> | null | undefined,
  profile: LibrosaProfile,
): Record<string, unknown> {
  const c = stored && typeof stored === "object" ? stored : {};
  const nested = c[profile];
  if (nested && typeof nested === "object") return nested as Record<string, unknown>;
  // Legacy flat config: map top-level lever keys onto the default profile.
  if (profile === "default" && Object.keys(c).some((k) => LEVER_BY_ID.has(k))) return c;
  return {};
}

/** Coerce + clamp a stored value to its lever's range; ignore unknown keys. */
function sanitize(raw: Record<string, unknown> | null | undefined): LibrosaConfig {
  const out: LibrosaConfig = {};
  if (!raw) return out;
  for (const [id, v] of Object.entries(raw)) {
    const lever = LEVER_BY_ID.get(id);
    if (!lever) continue;
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) continue;
    out[id] = Math.min(lever.max, Math.max(lever.min, n));
  }
  return out;
}

/**
 * Merge precedence: registry default < profile config < per-song override.
 * Always returns a complete config (every lever id present).
 */
export function mergeConfig(
  profileCfg?: Record<string, unknown> | null,
  perSong?: Record<string, unknown> | null,
): LibrosaConfig {
  return {
    ...DEFAULT_CONFIG,
    ...sanitize(profileCfg),
    ...sanitize(perSong),
  };
}

/** Group levers by their `section` label, preserving registry order. */
export function leversBySection(levers: Lever[]): { section: string; levers: Lever[] }[] {
  const order: string[] = [];
  const map = new Map<string, Lever[]>();
  for (const l of levers) {
    if (!map.has(l.section)) {
      map.set(l.section, []);
      order.push(l.section);
    }
    map.get(l.section)!.push(l);
  }
  return order.map((section) => ({ section, levers: map.get(section)! }));
}
