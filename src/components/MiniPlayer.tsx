"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface MiniPlayerProps {
  streamingUrl: string;
  trackNumber: number;
  trackTitle: string;
  durationSeconds: number;
}

// Seeded PRNG (mulberry32) — deterministic waveform per track
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return hash;
}

function generateBars(title: string, count: number): number[] {
  const rng = mulberry32(hashString(title));
  const raw: number[] = [];

  for (let i = 0; i < count; i++) {
    // Layer two noise passes for organic feel
    const base = rng() * 0.6 + 0.2;
    const detail = (rng() - 0.5) * 0.3;
    raw.push(Math.max(0.15, Math.min(1, base + detail)));
  }

  // Smooth pass
  const smoothed: number[] = [];
  for (let i = 0; i < raw.length; i++) {
    const prev = raw[i - 1] ?? raw[i];
    const next = raw[i + 1] ?? raw[i];
    smoothed.push(prev * 0.2 + raw[i] * 0.6 + next * 0.2);
  }
  return smoothed;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const PREVIEW_START = 13;
const PREVIEW_DURATION = 30;
const FADE_DURATION = 2; // seconds
const BAR_COUNT = 50;
const CIRCUMFERENCE = 2 * Math.PI * 18; // r=18

export function MiniPlayer({
  streamingUrl,
  trackNumber,
  trackTitle,
  durationSeconds,
}: MiniPlayerProps) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0–1 through preview window
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number>(0);
  const bars = generateBars(trackTitle, BAR_COUNT);

  const stopPlayback = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setPlaying(false);
    setProgress(0);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPlayback();
    };
  }, [stopPlayback]);

  function tick() {
    const audio = audioRef.current;
    if (!audio || audio.paused) return;

    const elapsed = audio.currentTime - PREVIEW_START;
    const pct = Math.max(0, Math.min(1, elapsed / PREVIEW_DURATION));
    setProgress(pct);

    // Fade out near end
    const remaining = PREVIEW_DURATION - elapsed;
    if (remaining <= FADE_DURATION) {
      audio.volume = Math.max(0, remaining / FADE_DURATION);
    }

    // Stop at end of preview
    if (elapsed >= PREVIEW_DURATION) {
      stopPlayback();
      return;
    }

    rafRef.current = requestAnimationFrame(tick);
  }

  async function handleToggle() {
    if (playing) {
      stopPlayback();
      return;
    }

    const audio = new Audio(streamingUrl);
    audioRef.current = audio;
    audio.currentTime = PREVIEW_START;
    audio.volume = 0;

    audio.addEventListener("canplay", () => {
      audio.play().then(() => {
        setPlaying(true);
        // Fade in
        let vol = 0;
        const fadeIn = setInterval(() => {
          vol += 0.05;
          if (vol >= 1) {
            audio.volume = 1;
            clearInterval(fadeIn);
          } else {
            audio.volume = vol;
          }
        }, FADE_DURATION * 1000 / 20);

        rafRef.current = requestAnimationFrame(tick);
      });
    }, { once: true });

    audio.addEventListener("error", () => {
      stopPlayback();
    }, { once: true });

    audio.load();
  }

  const ringOffset = CIRCUMFERENCE - progress * CIRCUMFERENCE;
  const playedBarCount = Math.floor(progress * BAR_COUNT);

  return (
    <div className={`mini-player ${playing ? "mini-player--active" : ""}`}>
      <button
        type="button"
        className="mini-player__play-btn"
        onClick={handleToggle}
        aria-label={playing ? "Stop preview" : "Play preview"}
      >
        <svg className="mini-player__ring" viewBox="0 0 40 40" aria-hidden="true">
          <circle className="mini-player__ring-bg" cx="20" cy="20" r="18" />
          <circle
            className="mini-player__ring-progress"
            cx="20"
            cy="20"
            r="18"
            style={{ strokeDasharray: CIRCUMFERENCE, strokeDashoffset: ringOffset }}
          />
        </svg>
        <span className="mini-player__icon" />
      </button>

      <span className="mini-player__number">{trackNumber}</span>
      <span className="mini-player__name">{trackTitle}</span>

      <div className="mini-player__waveform">
        {/* Background bars (unplayed) */}
        <div className="mini-player__wf-layer mini-player__wf-bg">
          <div className="mini-player__wf-main">
            {bars.map((h, i) => (
              <span key={i} style={{ height: `${h * 100}%` }} />
            ))}
          </div>
          <div className="mini-player__wf-reflect">
            {bars.map((h, i) => (
              <span key={i} style={{ height: `${h * 100}%` }} />
            ))}
          </div>
        </div>

        {/* Foreground bars (played) — clipped by progress */}
        <div
          className="mini-player__wf-layer mini-player__wf-fg-clip"
          style={{ width: `${progress * 100}%` }}
        >
          <div className="mini-player__wf-fg-inner">
            <div className="mini-player__wf-main">
              {bars.map((h, i) => (
                <span key={i} style={{ height: `${h * 100}%` }} />
              ))}
            </div>
            <div className="mini-player__wf-reflect">
              {bars.map((h, i) => (
                <span key={i} style={{ height: `${h * 100}%` }} />
              ))}
            </div>
          </div>
        </div>
      </div>

      <span className="mini-player__duration">
        {formatDuration(durationSeconds)}
      </span>
    </div>
  );
}
