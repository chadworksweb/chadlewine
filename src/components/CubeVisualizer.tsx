"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { usePlayer } from "@/components/PlayerContext";
import { focalCropStyle } from "@/lib/focal-crop";
import type { BeatMorphRequest, MeshAnimRef, PulseRequest, SnarePulseRequest } from "@/components/CubeVisualizerMesh";

/** One row of songs.beat_data — a single drum/instrument hit moment.
 *  Keys present iff that stem fired on this hit. Sparse on purpose so
 *  the payload stays small across hundreds of hits per song. */
type BeatEvent = {
  at: number;
  k?: number;   // kick      -> face bulge morph
  s?: number;   // snare     -> corner strobe
  h?: number;   // hat       -> rim brightness pulse
  to?: number;  // tom       -> cube position shake
  bp?: number;  // bass pulse-> uBass spike
  bs?: number;  // bass synth-> ambient palette shift (CSS, parent-handled)
};
import "./CubeVisualizer.css";

// Three.js + react-three-fiber are client-only and heavy (~250 KB gzipped).
// Dynamic-import keeps them out of the song-detail SSR bundle and out of
// the initial JS for visitors who never press play.
const CubeVisualizerMesh = dynamic(
  () => import("@/components/CubeVisualizerMesh").then((m) => m.CubeVisualizerMesh),
  { ssr: false },
);

interface CubeVisualizerProps {
  songId: string;
  coverArtPath: string | null;
  coverArtAlt: string;
  cardFocalX?: number | null;
  cardFocalY?: number | null;
  cardZoom?: number | null;
  /** Precomputed beat onset timestamps in seconds. When present, the
   *  visualizer fires morphs at those exact timecodes (sample-accurate,
   *  vocal-resistant). When null/empty, falls back to live FFT spike
   *  detection in the audio loop below. */
  beatPeaks?: number[] | null;
  /** Per-beat full-band onset strength, 0..1, aligned with beatPeaks.
   *  Currently used for diagnostics; reserved for future non-kick effects. */
  beatStrengths?: number[] | null;
  /** Per-beat kick-band (~20-160 Hz) energy, 0..1, aligned with beatPeaks.
   *  Drives kick-only morphs: beats below KICK_THRESH are skipped entirely
   *  so the cube reacts to actual kick hits, not snares/hats/ghost notes. */
  beatKicks?: number[] | null;
  /** Per-beat snare-band (~200-450 Hz) energy, 0..1, aligned with beatPeaks.
   *  Drives the airplane-wingtip strobe at the cube's 8 corners. Fires
   *  independently of kicks so a kick+snare beat gets both effects. */
  beatSnares?: number[] | null;
  /** Multi-stem drum + instrument hits from analyze_drums_stems.py.
   *  Takes priority over beat_peaks/kicks/snares when present — songs
   *  with isolated stems get richer per-hit dispatch (hat, tom, bass).
   *  See BeatEvent for the per-row shape. */
  beatData?: BeatEvent[] | null;
  /** Seconds to add to every beat_data event time at playback. Stems
   *  exported from Ableton rarely align to the ms with the published
   *  MP3; this nudge corrects without re-analyzing. Positive = events
   *  fire later (stems lag the MP3). Negative = earlier. */
  beatOffset?: number | null;
  /** Continuous RMS envelope of the bass-synth stem, sampled at
   *  bassSynthEnvelopeHz. When present, drives the ambient swell
   *  directly (no discrete attack/decay), making sustained synth
   *  passages render as continuous color swells instead of sparse
   *  flashes on rare note attacks. */
  bassSynthEnvelope?: number[] | null;
  bassSynthEnvelopeHz?: number | null;
  /** Per-frame normalized pitch of the bass-synth stem (0..1 over the
   *  song's MIDI range). Same sample rate + length as envelope. Drives
   *  ambient/glow hue rotation per note. */
  bassSynthPitch?: number[] | null;
}

// Beats with kick-band energy below this are NOT kicks — skip the morph
// entirely so the cube responds to drums only. Tuned for the normalized
// 0..1 values written by scripts/analyze_beats.py: clear kicks land
// 0.4-1.0, snare/hat-only beats land below 0.25 in practice.
const KICK_THRESH = 0.32;
// Intensity scaling for kicks above the threshold. Bumped from
// (0.55, 0.75) -> (0.65, 0.95) per spec: morph reaction stronger on
// kicks. Bottom-of-range kick now ~0.95 intensity (vs prior 0.79);
// the song's peak kick drives ~1.60 intensity (clamped by mesh at 1.7).
const KICK_INTENSITY_FLOOR = 0.65;
const KICK_INTENSITY_RANGE = 0.95;

// Snare threshold mirrors the kick threshold's role. Snare-band onset
// is much cleaner thanks to HPSS — clear snare hits land 0.4-1.0,
// kick-only beats land near 0. 0.30 catches the meaningful range
// without firing strobes on every weak articulation in the band.
const SNARE_THRESH = 0.15;  // stems are clean by construction — lower threshold catches softer roll hits
// Snare strobe peaks at ~1.0 intensity. Cube's snare uniform clamps
// at 1.2 so even maxed snares can't blow out beyond a controlled flash.
const SNARE_INTENSITY_FLOOR = 0.55;
const SNARE_INTENSITY_RANGE = 0.55;

// Stem-derived thresholds (used when beat_data is present, i.e., the song
// was analyzed via analyze_drums_stems.py from isolated stems). Stems
// have zero cross-talk by construction — every detected onset IS that
// drum — so thresholds can be much lower without risking false fires.
// They're really just floors below which the visual would be invisible.
// Hat dash trail: each hat hit advances a pen across the cube's surface
// and drops a short-lived white dash at the new position. Threshold is
// low because hats are dense in most songs and the visual layer is
// designed to read as a constant tracery (not punctuation).
const HAT_THRESH = 0.18;
// 30-entry ring buffer: ages 0..19 = full brightness, 20..29 = linear
// fade to 0, drop at 30. Bumping these requires syncing the shader's
// loop bound (kept as a literal int there since GLSL needs constant).
const HAT_TRAIL_FULL = 20;
const HAT_TRAIL_FADE = 10;
const HAT_TRAIL_MAX = HAT_TRAIL_FULL + HAT_TRAIL_FADE;  // 30

// Cube face adjacency — for each face, which face neighbors it on edge
// [right (u>1), left (u<0), top (v>1), bottom (v<0)].
//
// Face IDs match the shader's vFace (0=+X, 1=-X, 2=+Y, 3=-Y, 4=+Z, 5=-Z).
// Derived from Three.js BoxGeometry's per-face UV orientation. Without
// this table, the prior implementation picked a RANDOM adjacent face
// at every edge crossing, which roughly half the time jumped to a face
// that's on the far side of the cube from the current viewpoint — the
// trail visually vanished. The deterministic mapping below keeps the
// pen on faces that are geometrically adjacent at the edge it crossed.
const FACE_NEIGHBORS: Record<number, readonly [number, number, number, number]> = {
  0: [5, 4, 2, 3], // +X: r=-Z l=+Z t=+Y b=-Y
  1: [4, 5, 2, 3], // -X: r=+Z l=-Z t=+Y b=-Y
  2: [0, 1, 5, 4], // +Y: r=+X l=-X t=-Z b=+Z
  3: [0, 1, 4, 5], // -Y: r=+X l=-X t=+Z b=-Z
  4: [0, 1, 2, 3], // +Z: r=+X l=-X t=+Y b=-Y
  5: [1, 0, 2, 3], // -Z: r=-X l=+X t=+Y b=-Y
};
const TOM_THRESH = 0.20;
const BASS_PULSE_THRESH = 0.20;
const BASS_SYNTH_THRESH = 0.15;

// Bass-synth envelope shaping (applied to the continuous envelope path
// only). GATE = 0 and CURVE = 1 means raw envelope passes through
// unshaped — the "cranked, always-on" baseline. Adjust GATE upward to
// gate quiet sections out, or CURVE upward to crush the noise floor
// and emphasize peaks.
const BASS_SYNTH_ENV_GATE = 0;
const BASS_SYNTH_ENV_CURVE = 1;
// Low-pass smoothing on the envelope readout. Time constant in ms —
// higher = smoother + slower to respond + more ambient feel. At 400ms,
// the effect blends across a quarter-second window so 50ms-resolution
// envelope frame-to-frame jumps become continuous ambient swells.
const BASS_SYNTH_SMOOTHING_MS = 400;

// Diagnostic kick-only mode. When true: the FFT analyser is bypassed
// (no cube breathing, no EQ bars, no ambient color pump), rotation
// drift stops (cube stays statically oriented), and the ONLY visible
// motion is the kick morph firing from beat_data. Use to dial in
// beat_offset_seconds against the audible kick with zero other movement
// confusing the alignment. Set false to restore normal playback.
const DIAGNOSTIC_KICK_ONLY = false;

/** Pull 3 dominant colors out of an image via a downsampled canvas histogram.
 *  Quantizes each channel to 5 bits, weights buckets by saturation so the
 *  ambient layer pulls vivid tones instead of muddy grays. Returns hex
 *  strings ordered most-dominant first; falls back to neutrals if anything
 *  goes sideways (CORS, empty image, etc.). */
function extractPaletteFromImage(img: HTMLImageElement): [string, string, string] | null {
  try {
    const size = 48;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);
    const buckets = new Map<number, { count: number; r: number; g: number; b: number }>();
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      if (a < 200) continue;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const sat = max === 0 ? 0 : (max - min) / max;
      const lum = (r + g + b) / 3;
      // Skip near-white/near-black so we don't dominate ambient with paper/ink.
      if (lum < 18 || lum > 240) continue;
      // Bias toward saturated mids — they make the ambient feel alive.
      const weight = 1 + sat * 3 + (lum > 60 && lum < 200 ? 1 : 0);
      const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      const cur = buckets.get(key);
      if (cur) {
        cur.count += weight;
        cur.r += r; cur.g += g; cur.b += b;
      } else {
        buckets.set(key, { count: weight, r, g, b });
      }
    }
    if (buckets.size === 0) return null;
    const ranked = [...buckets.values()].sort((a, b) => b.count - a.count);
    const toHex = (e: { count: number; r: number; g: number; b: number }) => {
      const n = Math.max(1, Math.round(e.count));
      const r = Math.min(255, Math.round(e.r / n));
      const g = Math.min(255, Math.round(e.g / n));
      const b = Math.min(255, Math.round(e.b / n));
      return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
    };
    const c1 = ranked[0];
    const c2 = ranked[1] ?? ranked[0];
    const c3 = ranked[2] ?? ranked[1] ?? ranked[0];
    return [toHex(c1), toHex(c2), toHex(c3)];
  } catch {
    return null;
  }
}

export function CubeVisualizer({
  songId,
  coverArtPath,
  coverArtAlt,
  cardFocalX,
  cardFocalY,
  cardZoom,
  beatPeaks,
  beatStrengths: _beatStrengths,
  beatKicks,
  beatSnares,
  beatData,
  beatOffset,
  bassSynthEnvelope,
  bassSynthEnvelopeHz,
  bassSynthPitch,
}: CubeVisualizerProps) {
  const player = usePlayer();
  const isThis = player.isCurrent(songId);
  const playing = isThis && player.playing;
  // Stem-derived data wins when present — it carries more information
  // (hat, tom, bass effects) per-hit and is by-construction clean. The
  // legacy librosa path stays as a fallback for songs analyzed before
  // the multi-stem pipeline.
  const useBeatData = !!(beatData && beatData.length > 0);
  const usePrecomputedBeats = !useBeatData && !!(beatPeaks && beatPeaks.length > 0);
  const beatOffsetSec = beatOffset ?? 0;

  const rootRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const boxOuterRef = useRef<HTMLDivElement | null>(null);
  const boxResizeObsRef = useRef<ResizeObserver | null>(null);

  // Bridges to the Three.js mesh. meshAnimRef mirrors the rotation + bass
  // state each frame so the mesh's useFrame can read them without React
  // re-renders. meshBeatRef is a one-shot mailbox: tick sets pending=true
  // when a transient beat fires, the mesh consumes + clears it.
  const meshAnimRef = useRef<MeshAnimRef>({ rx: 0, ry: 0, bass: 0 });
  const meshBeatRef = useRef<BeatMorphRequest>({
    pending: false,
    seed: 0,
    intensity: 1,
  });
  const meshSnareRef = useRef<SnarePulseRequest>({
    pending: false,
    intensity: 1,
  });
  // Secondary stem effects — populated only when beat_data is present
  // (analyze_drums_stems.py path). For librosa-only songs these stay
  // idle. PulseRequest carries an optional seed so tom can pick a
  // shake direction per hit.
  const meshHatRef = useRef<PulseRequest>({ pending: false, intensity: 0, seed: 0 });
  // Hat dash pen + trail. Pen walks the cube's faces in face-local UV
  // space (0..1, 0..1). Each hat hit advances the pen by a small step
  // and drops a new entry on the trail. Direction has continuity (small
  // random nudge per step); face transitions happen at edge crossings
  // (random adjacent face, opposite-edge entry — keeps movement
  // continuous in u or v across the boundary).
  const penRef = useRef({
    face: 4,    // +Z (front) — first visible face the listener sees
    u: 0.5,
    v: 0.5,
    dirU: 0.78,  // initial heading ~22° from horizontal
    dirV: 0.62,
  });
  const hatTrailRef = useRef<Array<{ face: number; u: number; v: number; dirU: number; dirV: number; age: number }>>([]);
  const meshTomRef = useRef<PulseRequest>({ pending: false, intensity: 0, seed: 0 });
  const meshBassPulseRef = useRef<PulseRequest>({ pending: false, intensity: 0, seed: 0 });
  // Bass synth drives a CSS variable on the root (ambient gradient hue
  // shift), not a mesh uniform. Lives in this component, no mailbox to
  // the WebGL side needed.
  const bassSynthStateRef = useRef({ amount: 0 });
  // Smoothed pitch in 0..1 (normalized over the song's MIDI range).
  // Pushed to --cv-bass-synth-pitch each frame; CSS uses it to drive
  // hue-rotate on the ambient + glow layers (gated by envelope intensity
  // so silent sections don't leak a stale color cast).
  const bassSynthPitchStateRef = useRef({ value: 0.5 });
  // Callback ref: fires whenever the cube box attaches OR detaches. Because
  // the box only mounts when playing flips true, a normal useLayoutEffect with
  // [] deps misses the mount entirely (boxRef.current was null when it ran).
  // The callback ref runs at attach time, so --cv-half-z is set before the
  // first paint of the cube. Without this, every face renders at translateZ(0)
  // and the cube collapses to a flat stack.
  const attachBox = useCallback((el: HTMLDivElement | null) => {
    if (boxResizeObsRef.current) {
      boxResizeObsRef.current.disconnect();
      boxResizeObsRef.current = null;
    }
    boxRef.current = el;
    if (!el) return;
    const apply = () => {
      const w = el.offsetWidth;
      if (w > 0) el.style.setProperty("--cv-half-z", `${w / 2}px`);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    boxResizeObsRef.current = ro;
  }, []);

  // Persistent animation state. rx/ry are accumulated rotations in degrees,
  // INTENTIONALLY unwrapped — letting them grow past 360 means the box
  // transform never jumps from 360->0 (which the previous CSS transition
  // would interpolate backward, looking like a fast spin-back). vx/vy are
  // angular velocities driven by a slow random walk so the cube tumbles
  // organically with no repeating track.
  // DVD-screensaver motion. Each axis has a TARGET velocity (tvx/tvy) with
  // a fixed magnitude and a sign that occasionally flips. The actual
  // velocity (vx/vy) eases toward the target over a ~1.6s time constant,
  // so a sign flip doesn't whip — the cube smoothly decelerates through
  // zero and accelerates the other way, like a logo bouncing softly.
  const animRef = useRef((() => {
    // "Flying through space, no friction" — pick a random velocity once,
    // hold it forever. 3x slower than the prior baseline (~0.0029 deg/ms
    // X, ~0.0055 deg/ms Y → roughly one full rotation every 30 and 18
    // minutes respectively). The bounce/sign-flip logic below is gone:
    // the cube never makes a distinct change of direction, it just drifts.
    const tvx = 0.0029 * (Math.random() < 0.5 ? -1 : 1);
    const tvy = 0.0055 * (Math.random() < 0.5 ? -1 : 1);
    return {
      rx: 0, ry: 0,
      vx: tvx, vy: tvy,
      tvx, tvy,
      bass: 0, mid: 0, energy: 0,
      lastTs: 0,
      // Kick detection state. bassHist tracks the recent kick-band level
      // (now unused but kept in case we re-add envelope checks). prevKick
      // is the previous-frame value, used for spectral-flux onset
      // detection — a kick triggers a sharp positive delta, while
      // sustained vocals/bass do not.
      bassHist: new Float32Array(28),
      bassHistIdx: 0,
      beatCooldownUntil: 0,
      prevKick: 0,
      // Adaptive baseline / residual for vocal-resistant onset detection.
      // kickBaseline = slow envelope follower of the kick band; it rises
      // when vocals sustain in the band. Subtracting it from current kick
      // yields the residual — what's ABOVE the floor right now. Kicks
      // produce sharp residual spikes even when the floor is high.
      kickBaseline: 0,
      prevResidual: 0,
      // Index of the next not-yet-triggered beat in the precomputed
      // beat_peaks array. Advanced as playback crosses each timestamp;
      // re-synced on seek by walking forward/backward in the tick loop.
      nextBeatIdx: 0,
    };
  })());

  const [palette, setPalette] = useState<[string, string, string] | null>(null);
  const cardStyle = focalCropStyle(cardFocalX, cardFocalY, cardZoom);

  // Extract dominant colors from the cover art once per src. Loads a parallel
  // <img> with crossOrigin so we can read pixels off canvas (Bunny pull zone
  // serves CORS headers; if they ever change this falls back to defaults).
  useEffect(() => {
    if (!coverArtPath) return;
    let cancelled = false;
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      const p = extractPaletteFromImage(img);
      if (p) setPalette(p);
    };
    img.src = coverArtPath;
    return () => {
      cancelled = true;
    };
  }, [coverArtPath]);

  // Push palette into CSS vars (this is cheap — only on palette change).
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !palette) return;
    root.style.setProperty("--cv-c1", palette[0]);
    root.style.setProperty("--cv-c2", palette[1]);
    root.style.setProperty("--cv-c3", palette[2]);
  }, [palette]);

  // Audio-driven animation loop. Runs only while this song is the active one
  // and playing; otherwise the cube settles back to its idle pose. Big-beat
  // shape morphs are now handled inside CubeVisualizerMesh's WebGL shader;
  // this loop only owns rotation + bass smoothing + beat DETECTION (which
  // hands off to the mesh via meshBeatRef).
  useEffect(() => {
    const root = rootRef.current;
    const box = boxRef.current;
    if (!root || !box) return;

    let raf = 0;
    let analyser: AnalyserNode | null = null;
    let freqArr: Uint8Array | null = null;

    // Idle decay: ease bass/mid/energy back to 0, stop the rotation drift.
    const decayFrame = (ts: number) => {
      const s = animRef.current;
      const dt = s.lastTs ? Math.min(64, ts - s.lastTs) : 16;
      s.lastTs = ts;
      const k = 1 - Math.pow(0.001, dt / 1000);
      s.bass += (0 - s.bass) * k;
      s.mid += (0 - s.mid) * k;
      s.energy += (0 - s.energy) * k;
      root.style.setProperty("--cv-bass", s.bass.toFixed(3));
      root.style.setProperty("--cv-mid", s.mid.toFixed(3));
      root.style.setProperty("--cv-energy", s.energy.toFixed(3));
      // Idle EQ flattens via CSS rule; no need to touch bars here.
      if (s.bass > 0.005 || s.mid > 0.005 || s.energy > 0.005) {
        raf = requestAnimationFrame(decayFrame);
      } else {
        raf = 0;
      }
    };

    if (!playing) {
      raf = requestAnimationFrame(decayFrame);
      return () => {
        if (raf) cancelAnimationFrame(raf);
      };
    }

    analyser = player.getAnalyser();
    if (analyser) {
      // Backing buffer must be a concrete ArrayBuffer (not SharedArrayBuffer)
      // to satisfy AnalyserNode.getByteFrequencyData's stricter Uint8Array type
      // in current lib.dom.d.ts.
      freqArr = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
    }

    const tick = (ts: number) => {
      const s = animRef.current;
      const dt = s.lastTs ? Math.min(64, ts - s.lastTs) : 16;
      s.lastTs = ts;

      let bass = 0, mid = 0, energy = 0;
      // Narrow kick-detection window: bins 2-7 at fftSize 2048 cover ~40-150
      // Hz, which is where kick drum fundamentals live. Wider than that
      // bleeds into bass guitar / synth bass; narrower than that misses
      // genres with higher-pitched kicks. Kept separate from the broader
      // `bass` value used by the ambient / breathing effects so a busy
      // mid-range doesn't trigger the morph.
      let kick = 0;
      if (analyser && freqArr && !DIAGNOSTIC_KICK_ONLY) {
        analyser.getByteFrequencyData(freqArr as Uint8Array<ArrayBuffer>);
        const bins = freqArr.length;
        const bassEnd = Math.max(2, Math.floor(bins * 0.06));
        const midEnd = Math.max(bassEnd + 1, Math.floor(bins * 0.35));
        let bSum = 0, mSum = 0, eSum = 0;
        for (let i = 0; i < bassEnd; i++) bSum += freqArr[i];
        for (let i = bassEnd; i < midEnd; i++) mSum += freqArr[i];
        for (let i = 0; i < bins; i++) eSum += freqArr[i];
        bass = (bSum / bassEnd) / 255;
        mid = (mSum / (midEnd - bassEnd)) / 255;
        energy = (eSum / bins) / 255;

        // Kick band — bins 1-2 cover ~43-129Hz at fftSize 1024. Slightly
        // wider than just bin 1 so vocal masking of the deep fundamental
        // doesn't completely silence the kick signal; the kick body still
        // pokes through bin 2 (~86-129Hz) during dense vocal sections.
        const KICK_START = 1;
        const KICK_END = 3;
        let kSum = 0;
        for (let i = KICK_START; i < KICK_END; i++) kSum += freqArr[i];
        kick = (kSum / (KICK_END - KICK_START)) / 255;

      }

      // Smooth incoming values so the cube doesn't jitter on transients.
      const ka = 1 - Math.pow(0.001, dt / 110);    // fast attack
      const kr = 1 - Math.pow(0.001, dt / 320);    // slow release
      s.bass += (bass - s.bass) * (bass > s.bass ? ka : kr);
      s.mid += (mid - s.mid) * (mid > s.mid ? ka : kr);
      s.energy += (energy - s.energy) * (energy > s.energy ? ka : kr);

      if (useBeatData && beatData) {
        // Multi-stem dispatcher (analyze_drums_stems.py path). beat_data
        // is sorted by .at. We track the next-unfired index in the same
        // way as the beat_peaks branch below: walk forward as currentTime
        // crosses each event, binary-search to resync on seek.
        const t = player.getCurrentTime();
        const SLOP = 0.05;

        // Resync after backwards seek
        if (
          s.nextBeatIdx > 0 &&
          t + SLOP < (beatData[s.nextBeatIdx - 1].at + beatOffsetSec)
        ) {
          let lo = 0, hi = beatData.length;
          while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (beatData[mid].at + beatOffsetSec < t - SLOP) lo = mid + 1;
            else hi = mid;
          }
          s.nextBeatIdx = lo;
        }

        // Fast-forward past missed events (tab-in-background recovery)
        while (
          s.nextBeatIdx < beatData.length &&
          beatData[s.nextBeatIdx].at + beatOffsetSec < t - SLOP
        ) {
          s.nextBeatIdx++;
        }

        // Fire every event whose adjusted time has just crossed currentTime.
        // The inner loop handles the case where multiple events stacked
        // within one tick interval (which shouldn't happen at 60Hz given
        // a 16ms tick + ~50ms slop, but is cheap to handle).
        while (
          s.nextBeatIdx < beatData.length &&
          t + SLOP >= beatData[s.nextBeatIdx].at + beatOffsetSec
        ) {
          const ev = beatData[s.nextBeatIdx];
          s.nextBeatIdx++;

          // Snare / kick mutual exclusion preserved from the librosa path:
          // a hit with both kick and snare populated fires the strobe
          // only. Backbeats stay readable as strobe-not-morph events.
          const kickVal = ev.k ?? 0;
          const snareVal = ev.s ?? 0;
          if (snareVal >= SNARE_THRESH) {
            meshSnareRef.current.intensity =
              SNARE_INTENSITY_FLOOR + snareVal * SNARE_INTENSITY_RANGE;
            meshSnareRef.current.pending = true;
          } else if (kickVal >= KICK_THRESH) {
            meshBeatRef.current.seed = Math.random() * 1000;
            meshBeatRef.current.intensity =
              KICK_INTENSITY_FLOOR + kickVal * KICK_INTENSITY_RANGE;
            meshBeatRef.current.pending = true;
          }

          // Secondary effects stack freely with whichever of kick/snare
          // fired above — a backbeat with hat + snare gets both the
          // corner strobe AND the rim shimmer.
          const hatVal = ev.h ?? 0;
          if (hatVal >= HAT_THRESH) {
            // Advance the pen one step in its current direction, then
            // drop a new dash at the new position. Pen continuity gives
            // each hat hit a sense of "moving" along the cube; small
            // random direction nudges keep the path from being a perfect
            // straight line.
            const pen = penRef.current;
            const STEP = 0.06;  // 6% of face per hat
            pen.u += pen.dirU * STEP;
            pen.v += pen.dirV * STEP;

            // Edge crossing: jump to the GEOMETRICALLY ADJACENT face via
            // the FACE_NEIGHBORS table. Whichever edge had the largest
            // overshoot wins (handles diagonal exits cleanly). Pen
            // enters the new face at the opposite edge so u or v stays
            // continuous across the seam.
            if (pen.u < 0 || pen.u > 1 || pen.v < 0 || pen.v > 1) {
              let edge = -1;
              let excess = 0;
              if (pen.u > 1)          { edge = 0; excess = pen.u - 1; }
              if (pen.u < 0 && -pen.u > excess) { edge = 1; excess = -pen.u; }
              if (pen.v > 1 && pen.v - 1 > excess) { edge = 2; excess = pen.v - 1; }
              if (pen.v < 0 && -pen.v > excess) { edge = 3; excess = -pen.v; }

              const newFace = FACE_NEIGHBORS[pen.face][edge];

              // Clamp the secondary axis to [0,1] before transitioning,
              // then place the primary axis at the entry edge of the
              // new face. (Diagonal exits would otherwise carry an
              // out-of-range value into the new face's UV.)
              pen.u = Math.max(0, Math.min(1, pen.u));
              pen.v = Math.max(0, Math.min(1, pen.v));
              if (edge === 0)      pen.u = 0;  // exited right → enter left
              else if (edge === 1) pen.u = 1;  // exited left → enter right
              else if (edge === 2) pen.v = 0;  // exited top → enter bottom
              else                 pen.v = 1;  // exited bottom → enter top
              pen.face = newFace;
            }

            // Small heading nudge (≤±0.2 rad ≈ ±11°) per hit. Keeps
            // direction mostly continuous (not chaotic) with enough
            // wander that the trail doesn't draw a perfect line.
            const ang = (Math.random() - 0.5) * 0.4;
            const cos = Math.cos(ang);
            const sin = Math.sin(ang);
            const ndu = pen.dirU * cos - pen.dirV * sin;
            const ndv = pen.dirU * sin + pen.dirV * cos;
            const mag = Math.sqrt(ndu * ndu + ndv * ndv) || 1;
            pen.dirU = ndu / mag;
            pen.dirV = ndv / mag;

            // Age existing dashes, drop the old ones, push the new one
            // at the front (newest = age 0). Each dash captures the
            // pen's current heading so the shader can orient it as a
            // line segment along the direction of pen travel.
            const trail = hatTrailRef.current;
            for (const t of trail) t.age += 1;
            while (trail.length > 0 && trail[trail.length - 1].age >= HAT_TRAIL_MAX) {
              trail.pop();
            }
            trail.unshift({
              face: pen.face,
              u: pen.u,
              v: pen.v,
              dirU: pen.dirU,
              dirV: pen.dirV,
              age: 0,
            });
            if (trail.length > HAT_TRAIL_MAX) trail.length = HAT_TRAIL_MAX;
          }
          const tomVal = ev.to ?? 0;
          if (tomVal >= TOM_THRESH) {
            meshTomRef.current.seed = Math.random();
            meshTomRef.current.intensity = 0.5 + tomVal * 0.5;
            meshTomRef.current.pending = true;
          }
          const bpVal = ev.bp ?? 0;
          if (bpVal >= BASS_PULSE_THRESH) {
            meshBassPulseRef.current.intensity = 0.4 + bpVal * 0.6;
            meshBassPulseRef.current.pending = true;
          }
          // Discrete bass-synth dispatch — only used as a fallback when
          // a continuous envelope is NOT available. Sustained synths
          // produce sparse onset hits which alone don't drive a
          // perceptible ambient swell; the envelope path below replaces
          // this with a continuous follower.
          const bsVal = ev.bs ?? 0;
          if (!bassSynthEnvelope && bsVal >= BASS_SYNTH_THRESH) {
            bassSynthStateRef.current.amount = Math.max(
              bassSynthStateRef.current.amount,
              0.3 + bsVal * 0.7,
            );
          }
        }
      } else if (usePrecomputedBeats && beatPeaks) {
        // Precomputed-beats path: read live audio.currentTime and fire a
        // morph each time we cross a beat timestamp. Vocal-immune, sample-
        // accurate, no FFT needed for triggering. Resync on seek by
        // walking the cursor forward or backward to match the actual
        // playback position.
        const t = player.getCurrentTime();
        const SLOP = 0.05; // 50ms tolerance for missed frames

        // Resync after seek (currentTime jumped backwards past prior beat)
        if (s.nextBeatIdx > 0 && t + SLOP < beatPeaks[s.nextBeatIdx - 1]) {
          // Binary search the next future beat
          let lo = 0, hi = beatPeaks.length;
          while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (beatPeaks[mid] < t - SLOP) lo = mid + 1;
            else hi = mid;
          }
          s.nextBeatIdx = lo;
        }

        // Fast-forward past any beats we already missed (e.g. tab was in
        // background and currentTime advanced past several).
        while (
          s.nextBeatIdx < beatPeaks.length &&
          beatPeaks[s.nextBeatIdx] < t - SLOP
        ) {
          s.nextBeatIdx++;
        }

        // Fire if we just crossed the next beat. Kick-aware: when we have
        // per-beat kick-band data, skip beats below KICK_THRESH entirely
        // (snare/hat-only, ghost notes) and scale the surviving kicks'
        // intensity by their kick-band magnitude. Without kick data we
        // fall back to the prior uniform 0.7 morph on every beat.
        if (
          s.nextBeatIdx < beatPeaks.length &&
          t + SLOP >= beatPeaks[s.nextBeatIdx]
        ) {
          const idx = s.nextBeatIdx;
          s.nextBeatIdx++;
          if (beatKicks && idx < beatKicks.length) {
            const kick = beatKicks[idx];
            const snare = beatSnares?.[idx] ?? 0;
            // Snare takes precedence. Backbeats often have both kick AND
            // snare above their thresholds (snare body fundamentals leak
            // into the kick band, real backbeats stack both drums); if we
            // fire both, every snare beat ALSO morphs the cube — exactly
            // the visual the spec rejects. Treat the beat as a snare hit
            // whenever the snare band is meaningfully active, otherwise
            // fall through to the kick morph.
            if (snare >= SNARE_THRESH) {
              meshSnareRef.current.intensity =
                SNARE_INTENSITY_FLOOR + snare * SNARE_INTENSITY_RANGE;
              meshSnareRef.current.pending = true;
            } else if (kick >= KICK_THRESH) {
              meshBeatRef.current.seed = Math.random() * 1000;
              meshBeatRef.current.intensity =
                KICK_INTENSITY_FLOOR + kick * KICK_INTENSITY_RANGE;
              meshBeatRef.current.pending = true;
            }
            // else: ghost beat, no effect
          }
          // No `else` fallback: songs analyzed under the v1 pipeline (no
          // beat_kicks) still iterate their beat_peaks for seek-tracking
          // accounting, but fire no morphs. Same rule as the unprocessed
          // case below — only fully-processed songs morph.
        }
      }
      // No live-FFT spike-detection fallback anymore. Songs without
      // beat_data and without beat_peaks simply don't morph — the cube
      // still floats and the ambient still breathes, but visual stem
      // reaction requires the song to have been run through one of the
      // analyzers. Prevents the "kinda random" feeling on unprocessed
      // songs where live detection was misfiring on vocals.

      // Diagnostic kick-only: flatten EQ bars to scaleY(0) and skip the
      // rotation update so the cube stays statically oriented + the EQ
      // is invisible. Only the kick morph dispatched above remains.
      if (DIAGNOSTIC_KICK_ONLY) {
        s.bass = 0; s.mid = 0; s.energy = 0;
        bassSynthStateRef.current.amount = 0;
        root.style.setProperty("--cv-bass", "0");
        root.style.setProperty("--cv-mid", "0");
        root.style.setProperty("--cv-energy", "0");
        root.style.setProperty("--cv-bass-synth", "0");
        meshAnimRef.current.bass = 0;
        meshAnimRef.current.rx = s.rx;
        meshAnimRef.current.ry = s.ry;
        raf = requestAnimationFrame(tick);
        return;
      }

      // DVD-logo motion with eased direction changes. Target velocity
      // (tvx/tvy) has a fixed magnitude per axis, its sign flips on rare
      // random events (one axis at a time). Actual velocity smoothly eases
      // toward the target — 1.6s time constant means a sign flip plays
      // out as a gradual deceleration through zero and re-acceleration,
      // no whip. Speeds: ~tvy 0.032 deg/ms -> ~11s per Y rotation,
      // ~tvx 0.018 deg/ms -> ~20s per X rotation. Slow, deliberate float.
      // Solar-system rotation. Target velocity is held at a confident
      // ±max magnitude — the cube has a clear heading at all times.
      // Direction reversals happen rarely (mean ~3.5 min on Y, ~5.5 min
      // on X) and the velocity glides through the change over an 8s
      // ease — so slow that the reversal is barely perceptible as a
      // discrete event. Most of the time the cube is moving steadily
      // in one direction, like a planet on a long orbit.
      const ease = 1 - Math.pow(0.001, dt / 8000);
      s.vx += (s.tvx - s.vx) * ease;
      s.vy += (s.tvy - s.vy) * ease;
      if (Math.random() < 0.00008) s.tvy = -s.tvy;  // ~3.5 min mean
      if (Math.random() < 0.00005) s.tvx = -s.tvx;  // ~5.6 min mean
      s.rx += s.vx * dt;
      s.ry += s.vy * dt;

      // Bass synth — two paths, mutually exclusive:
      // - Continuous envelope (preferred): read pre-computed RMS at the
      //   playback time and assign directly. Sustained synth notes give
      //   continuous ambient swells exactly proportional to their level.
      // - Discrete attack + decay (fallback): when no envelope is in
      //   the DB, the bs entries in beat_data feed a Math.max + 500ms
      //   half-life decay (set up in the dispatcher above).
      const bsState = bassSynthStateRef.current;
      if (bassSynthEnvelope && bassSynthEnvelopeHz && bassSynthEnvelope.length > 0) {
        // Apply the same beatOffsetSec used for discrete event dispatch:
        // the envelope was sampled in the stem's timeline, but playback
        // is on the published MP3's timeline. Offset corrects between
        // the two so the swell lands at the same musical moment as the
        // kick/snare/tom hits.
        const tNow = player.getCurrentTime() - beatOffsetSec;
        // Linear interpolation between adjacent envelope frames so
        // playback inside a 50ms frame interval reads as a continuous
        // gradient rather than a stair-step.
        const fIdx = tNow * bassSynthEnvelopeHz;
        const idx0 = Math.floor(fIdx);
        let target = 0;
        if (idx0 >= 0 && idx0 < bassSynthEnvelope.length) {
          const a = bassSynthEnvelope[idx0];
          const b = bassSynthEnvelope[idx0 + 1] ?? a;
          const frac = fIdx - idx0;
          const raw = a * (1 - frac) + b * frac;
          // Gate + power curve: crush noise floor and emphasize peaks.
          if (raw > BASS_SYNTH_ENV_GATE) {
            const scaled = (raw - BASS_SYNTH_ENV_GATE) / (1 - BASS_SYNTH_ENV_GATE);
            target = Math.pow(scaled, BASS_SYNTH_ENV_CURVE);
          }
        }
        // Low-pass smooth toward the target over BASS_SYNTH_SMOOTHING_MS.
        // Without this, the envelope's frame-to-frame jumps register as
        // jitter; with it, the ambient swell glides smoothly between
        // levels — feels like a breathing layer instead of a follower.
        const k = 1 - Math.pow(0.001, dt / BASS_SYNTH_SMOOTHING_MS);
        bsState.amount += (target - bsState.amount) * k;

        // Pitch follows the same interpolation + smoothing pattern as the
        // envelope, with the same sample rate (envelope and pitch share
        // bassSynthEnvelopeHz by construction). Smoothed pitch drives
        // hue-rotate on the ambient layer via the --cv-bass-synth-pitch
        // CSS variable.
        if (bassSynthPitch && bassSynthPitch.length > 0 && idx0 >= 0 && idx0 < bassSynthPitch.length) {
          const pa = bassSynthPitch[idx0];
          const pb = bassSynthPitch[idx0 + 1] ?? pa;
          const frac = fIdx - idx0;
          const pitchTarget = pa * (1 - frac) + pb * frac;
          bassSynthPitchStateRef.current.value += (pitchTarget - bassSynthPitchStateRef.current.value) * k;
        }
      } else if (bsState.amount > 0.001) {
        const bsDecay = Math.pow(0.5, dt / 500);
        bsState.amount *= bsDecay;
        if (bsState.amount < 0.001) bsState.amount = 0;
      }

      root.style.setProperty("--cv-bass", s.bass.toFixed(3));
      root.style.setProperty("--cv-mid", s.mid.toFixed(3));
      root.style.setProperty("--cv-energy", s.energy.toFixed(3));
      root.style.setProperty("--cv-bass-synth", bsState.amount.toFixed(3));
      root.style.setProperty("--cv-bass-synth-pitch", bassSynthPitchStateRef.current.value.toFixed(3));
      box.style.setProperty("--cv-rx", `${s.rx.toFixed(2)}deg`);
      box.style.setProperty("--cv-ry", `${s.ry.toFixed(2)}deg`);

      // Mirror state for the WebGL mesh. Plain assignment — the mesh's
      // useFrame reads these on its own schedule without React renders.
      // bass is forced to 0 so the FFT-driven micro-breathing doesn't
      // continuously inflate/deflate the cube between stem hits. The cube
      // is now purely stem-reactive (kick morph, tom shake, etc.) plus
      // inertial drift. CSS ambient layer still uses s.bass — only the
      // shader's spatial response is muted.
      meshAnimRef.current.rx = s.rx;
      meshAnimRef.current.ry = s.ry;
      meshAnimRef.current.bass = 0;

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
    // Intentionally omit `player` from deps — PlayerProvider rebuilds its
    // context value object every audio tick, so adding `player` here
    // re-runs this effect ~60x/sec, cancelling our rAF before it can drive
    // steady-state rotation. getAnalyser is stable (useCallback []) inside
    // PlayerContext, so capturing player at effect-run time is safe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  // Fullscreen toggle. requestFullscreen on the cube root makes the
  // browser draw a square cube centered on a black viewport (CSS sizes
  // the element to min(100vw, 100vh) when :fullscreen). Esc / system
  // gesture exits; we listen for fullscreenchange to keep the toggle's
  // icon in sync if the user exits via the OS rather than our button.
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === rootRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggleFullscreen = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    if (document.fullscreenElement === el) {
      document.exitFullscreen().catch(() => {});
    } else {
      el.requestFullscreen().catch(() => {});
    }
  }, []);

  return (
    <div
      ref={rootRef}
      className={`cube-vis${playing ? " is-playing" : ""}${isFullscreen ? " is-fullscreen" : ""}`}
      aria-hidden={false}
    >
      {/* Flat cover stays mounted at all times — its opacity + scale is
          driven by --cv-unfold so it morphs into (and back out of) the cube
          front face position. next/image only the flat — other faces reuse
          the same src via plain <img> so the optimizer doesn't process the
          same blob 6x and crash its worker pool. */}
      {coverArtPath && (
        <Image
          src={coverArtPath}
          alt={coverArtAlt}
          className="cube-vis__flat"
          width={1200}
          height={1200}
          priority
          sizes="(max-width: 640px) 100vw, 600px"
          style={cardStyle}
        />
      )}

      <div className="cube-vis__ambient" aria-hidden="true" />
      <div className="cube-vis__glow" aria-hidden="true" />

      {/* Fullscreen toggle — small icon button, top-right of the cube.
          SVG inline so no dependency on icon fonts. Shape swaps between
          "expand" arrows (idle) and "collapse" arrows (fullscreen). */}
      <button
        type="button"
        className="cube-vis__fs-toggle"
        onClick={toggleFullscreen}
        aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
      >
        {isFullscreen ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
          </svg>
        )}
      </button>

      <div className="cube-vis__stage" aria-hidden="true">
        <div ref={boxOuterRef} className="cube-vis__box-outer">
          <div ref={attachBox} className="cube-vis__box">
            {/* WebGL mesh replaces the prior 6-CSS-faces cube. Rotation +
                beat morphs all live in the shader / useFrame loop inside
                the mesh component. We still keep the CSS box wrapper for
                positioning (58% of stage, centered) and so the morph
                container has a definitive size for the Canvas to fill. */}
            {coverArtPath && (
              <CubeVisualizerMesh
                coverArtPath={coverArtPath}
                animRef={meshAnimRef}
                beatRef={meshBeatRef}
                snareRef={meshSnareRef}
                hatRef={meshHatRef}
                tomRef={meshTomRef}
                bassPulseRef={meshBassPulseRef}
                hatTrailRef={hatTrailRef}
              />
            )}
          </div>
        </div>
          </div>

    </div>
  );
}
