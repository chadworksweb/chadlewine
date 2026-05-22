"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { usePlayer } from "@/components/PlayerContext";
import { focalCropStyle } from "@/lib/focal-crop";
import type { BeatMorphRequest, MeshAnimRef } from "@/components/CubeVisualizerMesh";
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
}

// EQ is mirrored on both axes. Bass sits at the OUTER edges, treble at
// the center. 108 bars total (+20% from 90); bars stay thin so the dense
// mirrored spectrum reads as spikes rather than a solid block.
const EQ_BAR_COUNT = 108;
const EQ_HALF = EQ_BAR_COUNT / 2;
const EQ_WIDTH = 100;          // SVG viewBox width
const EQ_HEIGHT = 100;         // SVG viewBox height (centerline at 50)
const EQ_BAR_GAP = EQ_WIDTH / EQ_BAR_COUNT;
const EQ_BAR_WIDTH = EQ_BAR_GAP * 0.34;
// Skip pure DC (bin 0). With fftSize 2048 each bin is ~21Hz so we keep
// the very-low bass bins (1+) which carry useful kick + sub energy.
const EQ_LOW_SKIP = 1;
// Wedge envelope — each bar's MAX geometric height varies by position.
// Outer bars (low end) get a short segment, center bars (high end) get a
// tall segment. scaleY animation still grows the bar symmetrically up+down
// from y=50; with smaller rects, outer bars simply have less room to fill.
const EQ_MIN_H = 14;   // viewBox units — outer-edge bars
const EQ_MAX_H = 92;   // viewBox units — center bars

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
}: CubeVisualizerProps) {
  const player = usePlayer();
  const isThis = player.isCurrent(songId);
  const playing = isThis && player.playing;

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
  const eqBarsRef = useRef<(SVGRectElement | null)[]>([]);
  const eqReflectsRef = useRef<(SVGRectElement | null)[]>([]);

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
    // Start the cube at full target velocity so motion is visible from the
    // first frame instead of ramping in from zero (looked frozen for ~1s).
    // Speed bumped 10% from the prior 0.015/0.008 baseline.
    const tvx = 0.0088 * (Math.random() < 0.5 ? -1 : 1);
    const tvy = 0.0165 * (Math.random() < 0.5 ? -1 : 1);
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
      if (analyser && freqArr) {
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

        // Kick band — bin 1 covers ~43-86Hz at fftSize 1024, exactly the
        // kick fundamental window. Bin 0 (DC + sub) is skipped. With the
        // smaller FFT window the energy here responds within ~23ms of a
        // kick attack instead of ~46ms, which keeps the morph firing on
        // beat even during vocal sections.
        const KICK_START = 1;
        const KICK_END = 2;
        let kSum = 0;
        for (let i = KICK_START; i < KICK_END; i++) kSum += freqArr[i];
        kick = (kSum / (KICK_END - KICK_START)) / 255;

        // Update EQ bars — Y-axis mirrored. Compute spectrum for EQ_HALF
        // values (low at h=0, high at h=HALF-1) and apply each value to a
        // symmetric pair of bars: one at index HALF-1-h (left of center),
        // one at index HALF+h (right of center). Bass sits in the middle,
        // treble fans out toward the edges.
        const usableTotal = Math.floor(bins * 0.7); // skip top, mostly silent
        const usable = usableTotal - EQ_LOW_SKIP;   // and the dead-weight low end
        for (let h = 0; h < EQ_HALF; h++) {
          const t0 = h / EQ_HALF;
          const t1 = (h + 1) / EQ_HALF;
          // Log-ish bin mapping. Curve exponent lowered from 1.8 -> 1.35
          // so the low-end bars get a meaningful bin span at the new 1024-
          // bin FFT (with 1.8 they collapsed to 1-2 bins each and barely
          // animated). 1.35 still gives octave-ish perceptual spacing.
          const b0 = EQ_LOW_SKIP + Math.floor(Math.pow(t0, 1.35) * usable);
          const b1 = Math.max(b0 + 1, EQ_LOW_SKIP + Math.floor(Math.pow(t1, 1.35) * usable));
          let sum = 0;
          for (let k = b0; k < b1; k++) sum += freqArr[k];
          // Per-bar frequency tilt — bass bins still have more raw energy,
          // so weight rises from ~0.28 at the bottom to 1.0 at the top so
          // the center bars don't permanently peg.
          const freqWeight = 0.28 + 0.72 * Math.pow(h / (EQ_HALF - 1), 0.85);
          const v = Math.min(1, (sum / (b1 - b0)) / 200) * freqWeight;
          // Per-pair scale ceiling — outer pairs at 0.5, center pairs at
          // ~0.576 (high-end height reduced 20% from the prior 0.72 peak).
          const peakCeiling = 0.5 + 0.076 * Math.pow(h / (EQ_HALF - 1), 0.7);
          const scaled = Math.max(0.04, Math.pow(v, 0.85)) * peakCeiling;
          // Bass at the outer edges, treble at the center: h=0 (lowest freq)
          // maps to the far-left and far-right bars; h=HALF-1 (highest)
          // maps to the two center bars.
          const leftIdx = h;
          const rightIdx = EQ_BAR_COUNT - 1 - h;
          const leftBar = eqBarsRef.current[leftIdx];
          const rightBar = eqBarsRef.current[rightIdx];
          const leftReflect = eqReflectsRef.current[leftIdx];
          const rightReflect = eqReflectsRef.current[rightIdx];
          const t = `scaleY(${scaled})`;
          const tr = `scaleY(${scaled * 0.85})`;
          if (leftBar) leftBar.style.transform = t;
          if (rightBar) rightBar.style.transform = t;
          if (leftReflect) leftReflect.style.transform = tr;
          if (rightReflect) rightReflect.style.transform = tr;
        }
      }

      // Smooth incoming values so the cube doesn't jitter on transients.
      const ka = 1 - Math.pow(0.001, dt / 110);    // fast attack
      const kr = 1 - Math.pow(0.001, dt / 320);    // slow release
      s.bass += (bass - s.bass) * (bass > s.bass ? ka : kr);
      s.mid += (mid - s.mid) * (mid > s.mid ? ka : kr);
      s.energy += (energy - s.energy) * (energy > s.energy ? ka : kr);

      // SPIKE detection — looking for sharp rises, not sustained presence.
      // Two onset gates working together:
      //   - Absolute delta: kick energy jumped by > 0.13 in one frame.
      //     Filters out floor noise.
      //   - Relative rise: kick energy is at least 60% HIGHER than the
      //     previous frame. This is the "spike vs sustained" gate — a
      //     constant synth bass dipping and recovering has small relative
      //     rise even if its absolute level is high. A real kick landing
      //     on top of that bass spikes the band 100%+ relative to the
      //     prior frame.
      //   - Absolute level: post-spike value must be loud enough.
      const delta = Math.max(0, kick - s.prevKick);
      const relRise = delta / Math.max(s.prevKick, 0.08);
      s.prevKick = kick;
      const isKick =
        delta > 0.13 &&
        relRise > 0.6 &&
        kick > 0.22 &&
        ts > s.beatCooldownUntil;
      if (isKick) {
        s.beatCooldownUntil = ts + 500;
        meshBeatRef.current.seed = Math.random() * 1000;
        meshBeatRef.current.intensity = Math.min(0.85, 0.45 + delta * 1.4);
        meshBeatRef.current.pending = true;
      }

      // DVD-logo motion with eased direction changes. Target velocity
      // (tvx/tvy) has a fixed magnitude per axis, its sign flips on rare
      // random events (one axis at a time). Actual velocity smoothly eases
      // toward the target — 1.6s time constant means a sign flip plays
      // out as a gradual deceleration through zero and re-acceleration,
      // no whip. Speeds: ~tvy 0.032 deg/ms -> ~11s per Y rotation,
      // ~tvx 0.018 deg/ms -> ~20s per X rotation. Slow, deliberate float.
      const ease = 1 - Math.pow(0.001, dt / 1600);
      s.vx += (s.tvx - s.vx) * ease;
      s.vy += (s.tvy - s.vy) * ease;
      // Bounce probabilities: ~0.0022/frame -> ~7s mean interval per axis.
      // Slower change cadence than before so the cube settles into each
      // direction long enough to register before reversing.
      if (Math.random() < 0.0022) s.tvy = -s.tvy;
      if (Math.random() < 0.0016) s.tvx = -s.tvx;
      s.rx += s.vx * dt;
      s.ry += s.vy * dt;

      root.style.setProperty("--cv-bass", s.bass.toFixed(3));
      root.style.setProperty("--cv-mid", s.mid.toFixed(3));
      root.style.setProperty("--cv-energy", s.energy.toFixed(3));
      box.style.setProperty("--cv-rx", `${s.rx.toFixed(2)}deg`);
      box.style.setProperty("--cv-ry", `${s.ry.toFixed(2)}deg`);

      // Mirror state for the WebGL mesh. Plain assignment — the mesh's
      // useFrame reads these on its own schedule without React renders.
      meshAnimRef.current.rx = s.rx;
      meshAnimRef.current.ry = s.ry;
      meshAnimRef.current.bass = s.bass;

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

  const eqIndices = useMemo(() => Array.from({ length: EQ_BAR_COUNT }, (_, i) => i), []);

  return (
    <div
      ref={rootRef}
      className={`cube-vis${playing ? " is-playing" : ""}`}
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
              />
            )}
          </div>
        </div>
          </div>

      {/* Mirrored EQ — each bar centered on the y=50 axis; scaleY drives the
          symmetric expansion up + down. Reflected (lower) layer is dimmer so
          the spectrum reads as a sound wave instead of a barcode. */}
      <svg
        className="cube-vis__eq"
        viewBox={`0 0 ${EQ_WIDTH} ${EQ_HEIGHT}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {eqIndices.map((i) => {
          const x = i * EQ_BAR_GAP + (EQ_BAR_GAP - EQ_BAR_WIDTH) / 2;
          // Centerness: 1 at the middle bars, 0 at the outer edges. Curve
          // (^0.65) keeps the inner cluster tall and lets the outer bars
          // ramp down gently rather than dropping off sharply.
          const center = (EQ_BAR_COUNT - 1) / 2;
          const centerness = 1 - Math.abs(i - center) / center;
          const barH = EQ_MIN_H + (EQ_MAX_H - EQ_MIN_H) * Math.pow(centerness, 0.65);
          const barY = 50 - barH / 2;
          return (
            <rect
              key={`u-${i}`}
              ref={(el) => { eqBarsRef.current[i] = el; }}
              className="cube-vis__eq-bar"
              x={x}
              y={barY}
              width={EQ_BAR_WIDTH}
              height={barH}
              rx={EQ_BAR_WIDTH * 0.35}
            />
          );
        })}
        {eqIndices.map((i) => {
          // Reflected fade — same geometry as primary, dimmer fill behind.
          const x = i * EQ_BAR_GAP + (EQ_BAR_GAP - EQ_BAR_WIDTH) / 2;
          const center = (EQ_BAR_COUNT - 1) / 2;
          const centerness = 1 - Math.abs(i - center) / center;
          const barH = EQ_MIN_H + (EQ_MAX_H - EQ_MIN_H) * Math.pow(centerness, 0.65);
          const barY = 50 - barH / 2;
          return (
            <rect
              key={`r-${i}`}
              ref={(el) => { eqReflectsRef.current[i] = el; }}
              className="cube-vis__eq-bar cube-vis__eq-bar--reflect"
              x={x}
              y={barY}
              width={EQ_BAR_WIDTH}
              height={barH}
              rx={EQ_BAR_WIDTH * 0.35}
            />
          );
        })}
      </svg>
    </div>
  );
}
