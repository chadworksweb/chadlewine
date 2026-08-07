"use client";

import Link from "next/link";
import { usePlayer, type PlaybackMode } from "@/components/PlayerContext";

interface MiniPlayerProps {
  songId: string;
  songSlug: string;
  streamingUrl: string;
  trackNumber: number;
  trackTitle: string;
  durationSeconds: number;
  artImagePath: string | null;
  artAlt: string | null;
  playbackMode?: PlaybackMode;
  // Hide the in-player title link. The song-detail page sets this since the
  // page H1 already shows the title.
  hideTitle?: boolean;
  // "row" (default): the full waveform bar. "art": the album art with the same
  // play button + progress ring overlaid, no waveform/metadata — used for the
  // mobile featured song.
  variant?: "row" | "art";
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
    const base = rng() * 0.6 + 0.2;
    const detail = (rng() - 0.5) * 0.3;
    raw.push(Math.max(0.15, Math.min(1, base + detail)));
  }

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
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const BAR_COUNT = 50;
const CIRCUMFERENCE = 2 * Math.PI * 18; // r=18

// Real SVG glyphs, conditionally rendered — NOT a CSS ::after with clip-path.
// iOS Safari fails to re-render a clip-path pseudo-element when toggling back
// to the triangle, which left the play icon missing after pause. Swapping
// whole elements (as the sticky player does) always paints correctly.
function PlayGlyph() {
  return (
    <svg className="mini-player__glyph mini-player__glyph--play" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseGlyph() {
  return (
    <svg className="mini-player__glyph mini-player__glyph--pause" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6 4h4v16H6zm8 0h4v16h-4z" />
    </svg>
  );
}

// The play/pause button + progress ring on its own. Exported because the cube
// visualizer on the song page overlays this exact control on the album art:
// one implementation, so the two can never drift apart. Every class here is
// styled in global.css; the `--art` sizing (72px circle, 42px glyph) comes
// from an ancestor carrying .mini-player--art.
export function MiniPlayerTransport({
  playing,
  progress,
  playbackMode = "preview",
  onToggle,
}: {
  playing: boolean;
  progress: number;
  playbackMode?: PlaybackMode;
  onToggle: () => void;
}) {
  const ringOffset = CIRCUMFERENCE - progress * CIRCUMFERENCE;
  return (
    <button
      type="button"
      className="mini-player__play-btn"
      onClick={onToggle}
      aria-label={playing ? "Pause" : `Play ${playbackMode === "preview" ? "preview" : ""}`}
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
      <span className="mini-player__icon">{playing ? <PauseGlyph /> : <PlayGlyph />}</span>
    </button>
  );
}

export function MiniPlayer({
  songId,
  songSlug,
  streamingUrl,
  trackNumber,
  trackTitle,
  hideTitle = false,
  durationSeconds,
  artImagePath,
  artAlt,
  playbackMode = "preview",
  variant = "row",
}: MiniPlayerProps) {
  const player = usePlayer();
  const isThis = player.isCurrent(songId);
  const playing = isThis && player.playing;
  const progress = isThis ? player.progress : 0;
  const bars = generateBars(trackTitle, BAR_COUNT);

  function handleToggle() {
    if (isThis) {
      if (player.playing) player.pause();
      else player.resume();
      return;
    }
    player.play({
      id: songId,
      slug: songSlug,
      title: trackTitle,
      streamingUrl,
      durationSeconds,
      artImagePath,
      artAlt,
      playbackMode,
    });
  }

  // The play button + progress ring, reused by both variants.
  const playButton = (
    <MiniPlayerTransport
      playing={playing}
      progress={progress}
      playbackMode={playbackMode}
      onToggle={handleToggle}
    />
  );

  if (variant === "art") {
    return (
      <div className={`mini-player mini-player--art ${playing ? "mini-player--active" : ""}`}>
        <div className="mini-player__art-stage">
          {artImagePath && (
            // eslint-disable-next-line @next/next/no-img-element -- ready CDN URL, same as the sticky player
            <img src={artImagePath} alt={artAlt || ""} className="mini-player__art-img" />
          )}
          {playButton}
        </div>
      </div>
    );
  }

  return (
    <div className={`mini-player ${playing ? "mini-player--active" : ""}`}>
      {playButton}

      <span className="mini-player__number">{trackNumber}</span>
      {!hideTitle && (
        <Link href={`/music/songs/${songSlug}`} className="mini-player__name">
          {trackTitle}
        </Link>
      )}

      <div className="mini-player__waveform">
        <div className="mini-player__wf-layer mini-player__wf-bg">
          <div className="mini-player__wf-main">
            {bars.map((h, i) => (
              <span key={i} className="mini-player__wf-bar" style={{ height: `${h * 100}%` }} />
            ))}
          </div>
          <div className="mini-player__wf-reflect">
            {bars.map((h, i) => (
              <span key={i} className="mini-player__wf-bar" style={{ height: `${h * 100}%` }} />
            ))}
          </div>
        </div>

        <div
          className="mini-player__wf-layer mini-player__wf-fg"
          style={{ clipPath: `inset(0 ${(1 - progress) * 100}% 0 0)` }}
          aria-hidden="true"
        >
          <div className="mini-player__wf-main">
            {bars.map((h, i) => (
              <span key={i} className="mini-player__wf-bar" style={{ height: `${h * 100}%` }} />
            ))}
          </div>
          <div className="mini-player__wf-reflect">
            {bars.map((h, i) => (
              <span key={i} className="mini-player__wf-bar" style={{ height: `${h * 100}%` }} />
            ))}
          </div>
        </div>
      </div>

      <span className="mini-player__duration">
        {durationSeconds > 0 ? formatDuration(durationSeconds) : "—"}
      </span>
    </div>
  );
}
