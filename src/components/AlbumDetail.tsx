"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";

interface AlbumProps {
  id: string;
  title: string;
  slug: string;
  cover_art_path: string | null;
  cover_art_alt: string | null;
  release_date: string | null;
  description: string | null;
  format_label: string | null;
  price: number | null;
}

interface SongProps {
  id: string;
  title: string;
  slug: string;
  track_number: number;
  duration_seconds: number | null;
  streaming_path: string | null;
  price: number | null;
}

interface AlbumBadgeProps {
  tier: string;
  tierLabel: string;
  tierHex: string;
  charge: number;
  chargeSummary: string | null;
  contaminated: boolean;
  contaminationNote: string | null;
  artistSlug?: string | null;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function chargeToNeedleAngle(charge: number): number {
  const clamped = Math.max(-100, Math.min(100, charge));
  return -(clamped / 100) * 58;
}

function CompassIcon({ charge, tierHex }: { charge: number; tierHex: string }) {
  const angle = chargeToNeedleAngle(charge);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 32 32" style={{ display: "block" }}>
      <rect width="32" height="32" rx="6" fill="#0a0a14"/>
      <path d="M 5,20 A 11,11 0 0,1 7.6,13.1" fill="none" stroke="#9933ff" strokeWidth="6" strokeLinecap="butt"/>
      <path d="M 7.6,13.1 A 11,11 0 0,1 12.6,9.6" fill="none" stroke="#3388ff" strokeWidth="6" strokeLinecap="butt"/>
      <path d="M 12.6,9.6 A 11,11 0 0,1 19.4,9.6" fill="none" stroke="#33cc55" strokeWidth="6" strokeLinecap="butt"/>
      <path d="M 19.4,9.6 A 11,11 0 0,1 24.4,13.1" fill="none" stroke="#ffbb33" strokeWidth="6" strokeLinecap="butt"/>
      <path d="M 24.4,13.1 A 11,11 0 0,1 27,20" fill="none" stroke="#ff3333" strokeWidth="6" strokeLinecap="butt"/>
      <g transform={`rotate(${angle}, 16, 20)`}>
        <polygon points="16,10 14.2,20 17.8,20" fill="#eeeef4"/>
      </g>
      <circle cx="16" cy="20" r="3" fill={tierHex}/>
    </svg>
  );
}

// Seeded PRNG for deterministic waveform
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

const PREVIEW_START = 13;
const PREVIEW_DURATION = 30;
const FADE_DURATION = 2;
const BAR_COUNT = 50;
const CIRCUMFERENCE = 2 * Math.PI * 18;

export function AlbumDetail({
  album,
  songs,
  badge,
  availableFormats = [],
}: {
  album: AlbumProps;
  songs: SongProps[];
  badge?: AlbumBadgeProps | null;
  availableFormats?: Array<"mp3" | "flac" | "wav">;
}) {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [buying, setBuying] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const hasAnyFormat = availableFormats.length > 0;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number>(0);

  const year = album.release_date
    ? new Date(album.release_date).getFullYear()
    : null;

  const stopPlayback = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setPlayingId(null);
    setProgress(0);
  }, []);

  useEffect(() => {
    return () => { stopPlayback(); };
  }, [stopPlayback]);

  function tick() {
    const audio = audioRef.current;
    if (!audio || audio.paused) return;
    const elapsed = audio.currentTime - PREVIEW_START;
    const pct = Math.max(0, Math.min(1, elapsed / PREVIEW_DURATION));
    setProgress(pct);
    const remaining = PREVIEW_DURATION - elapsed;
    if (remaining <= FADE_DURATION) {
      audio.volume = Math.max(0, remaining / FADE_DURATION);
    }
    if (elapsed >= PREVIEW_DURATION) {
      stopPlayback();
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  }

  function handlePlay(song: SongProps) {
    if (playingId === song.id) {
      stopPlayback();
      return;
    }
    if (!song.streaming_path) return;

    stopPlayback();
    const audio = new Audio(song.streaming_path);
    audioRef.current = audio;
    audio.currentTime = PREVIEW_START;
    audio.volume = 0;

    audio.addEventListener("canplay", () => {
      audio.play().then(() => {
        setPlayingId(song.id);
        let vol = 0;
        const fadeIn = setInterval(() => {
          vol += 0.05;
          if (vol >= 1) { audio.volume = 1; clearInterval(fadeIn); }
          else { audio.volume = vol; }
        }, FADE_DURATION * 1000 / 20);
        rafRef.current = requestAnimationFrame(tick);
      });
    }, { once: true });

    audio.addEventListener("error", () => { stopPlayback(); }, { once: true });
    audio.load();
  }

  return (
    <div className="track-detail">
      <div className="track-detail__grid">
        {/* Left — Album art */}
        <div className="track-detail__art-col">
          {album.cover_art_path && (
            <Image
              src={album.cover_art_path}
              alt={album.cover_art_alt || album.title}
              className="track-detail__cover"
              width={1200}
              height={1200}
              sizes="(max-width: 720px) 100vw, 600px"
              priority
            />
          )}
        </div>

        {/* Right — Album content */}
        <div className="track-detail__content-col">
          <h1 className="track-detail__title">{album.title}</h1>

          {/* Info bar */}
          <div className="track-detail__info-bar" data-cols={3}>
            <div className="track-detail__info-cell">
              <span className="track-detail__info-label">Tracks</span>
              <span className="track-detail__info-value">{songs.length}</span>
            </div>
            {year && (
              <div className="track-detail__info-cell">
                <span className="track-detail__info-label">Released</span>
                <span className="track-detail__info-value">{year}</span>
              </div>
            )}
            {album.format_label && (
              <div className="track-detail__info-cell">
                <span className="track-detail__info-label">Format</span>
                <span className="track-detail__info-value">{album.format_label}</span>
              </div>
            )}
          </div>

          {/* Action row: buy button + RC badge */}
          <div className="track-detail__action-row">
            <div className="track-detail__actions">
              {album.price && hasAnyFormat ? (
                <button
                  type="button"
                  className="track-detail__btn track-detail__btn--buy-album"
                  disabled={buying}
                  onClick={async () => {
                    setBuying(true);
                    try {
                      const res = await fetch("/api/music-checkout", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ type: "album", id: album.id }),
                      });
                      const data = await res.json();
                      if (data.url) window.location.href = data.url;
                    } finally {
                      setBuying(false);
                    }
                  }}
                >
                  {buying ? "..." : `Buy Album — $${Number(album.price).toFixed(2)}`}
                </button>
              ) : (
                <button type="button" className="track-detail__btn track-detail__btn--buy-album" disabled>
                  Not yet available
                </button>
              )}
            </div>

            {badge && (
              <div className="track-detail__rc-badge">
                <a
                  href={badge.artistSlug ? `https://risingcompass.net/artists/${encodeURIComponent(badge.artistSlug)}` : "https://risingcompass.net"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="track-detail__rc-compass-link"
                >
                  <CompassIcon charge={badge.charge} tierHex={badge.tierHex} />
                </a>
                <div className="track-detail__rc-data">
                  <span className="track-detail__rc-tier" style={{ color: badge.tierHex }}>
                    {badge.tierLabel}
                  </span>
                  <span className="track-detail__rc-charge">
                    {badge.charge > 0 ? "+" : ""}{badge.charge}
                  </span>
                </div>
                {badge.chargeSummary && (
                  <div className="track-detail__rc-summary-wrap">
                    <button
                      type="button"
                      className="track-detail__rc-summary-btn"
                      onClick={() => setSummaryOpen((v) => !v)}
                      aria-label="Read charge summary"
                      title="Charge summary"
                    >
                      &#x1F4AC;
                    </button>
                    {summaryOpen && (
                      <div className="track-detail__rc-summary-tooltip">
                        <p>{badge.chargeSummary}</p>
                        {badge.contaminated && badge.contaminationNote && (
                          <p className="track-detail__rc-contam">{badge.contaminationNote}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Mini player track listing */}
          {songs.length > 0 && (
            <div className="album-detail__player">
              {songs.map((song) => {
                const isActive = playingId === song.id;
                const hasAudio = !!song.streaming_path;
                const bars = generateBars(song.title, BAR_COUNT);
                const songProgress = isActive ? progress : 0;
                const ringOffset = CIRCUMFERENCE - songProgress * CIRCUMFERENCE;

                return (
                  <div
                    key={song.id}
                    className={`mini-player ${isActive ? "mini-player--active" : ""} ${!hasAudio ? "mini-player--no-audio" : ""}`}
                  >
                    <button
                      type="button"
                      className="mini-player__play-btn"
                      onClick={hasAudio ? () => handlePlay(song) : undefined}
                      disabled={!hasAudio}
                      aria-label={isActive ? "Stop preview" : "Play preview"}
                    >
                      <svg className="mini-player__ring" viewBox="0 0 40 40" aria-hidden="true">
                        <circle className="mini-player__ring-bg" cx="20" cy="20" r="18" />
                        <circle
                          className="mini-player__ring-progress"
                          cx="20" cy="20" r="18"
                          style={{ strokeDasharray: CIRCUMFERENCE, strokeDashoffset: ringOffset }}
                        />
                      </svg>
                      <span className="mini-player__icon" />
                    </button>

                    <span className="mini-player__number">{song.track_number}</span>

                    <Link
                      href={`/music/songs/${song.slug}`}
                      className="mini-player__name"
                    >
                      {song.title}
                    </Link>

                    <div className="mini-player__waveform">
                      <div className="mini-player__wf-layer mini-player__wf-bg">
                        <div className="mini-player__wf-main">
                          {bars.map((h, i) => <span key={i} style={{ height: `${h * 100}%` }} />)}
                        </div>
                        <div className="mini-player__wf-reflect">
                          {bars.map((h, i) => <span key={i} style={{ height: `${h * 100}%` }} />)}
                        </div>
                      </div>
                      <div
                        className="mini-player__wf-layer mini-player__wf-fg-clip"
                        style={{ width: `${songProgress * 100}%` }}
                      >
                        <div className="mini-player__wf-fg-inner">
                          <div className="mini-player__wf-main">
                            {bars.map((h, i) => <span key={i} style={{ height: `${h * 100}%` }} />)}
                          </div>
                          <div className="mini-player__wf-reflect">
                            {bars.map((h, i) => <span key={i} style={{ height: `${h * 100}%` }} />)}
                          </div>
                        </div>
                      </div>
                    </div>

                    <span className="mini-player__duration">
                      {song.duration_seconds ? formatDuration(song.duration_seconds) : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Album description */}
          {album.description && (
            <div className="track-detail__section">
              <h3 className="track-detail__section-title">About This Album</h3>
              <div className="track-detail__summary-text">{album.description}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
