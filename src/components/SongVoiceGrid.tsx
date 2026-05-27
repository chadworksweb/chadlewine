"use client";

import { useEffect, useRef, useState } from "react";

export interface VoiceSong {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  artUrl: string | null;
  artAlt: string | null;
  streamingUrl: string | null;
  durationSeconds: number | null;
  playbackMode: "preview" | "full";
  rcCharge: number | null;
  /** Canonical Rising Compass tier color (hex) for this song's charge. */
  rcColor: string | null;
}

// Local preview window. Intentionally NOT wired to the global sticky player:
// these are throwaway previews that stop when the visitor leaves the page,
// keeping them in browse/evaluate mode rather than the full-site player.
const PREVIEW_START = 13;
const PREVIEW_DURATION = 30;

// Color the charge by its value: red (-100) -> yellow (0) -> green (+100).
function chargeColor(charge: number): string {
  const c = Math.max(-100, Math.min(100, charge));
  const hue = ((c + 100) / 200) * 120;
  return `hsl(${hue}, 72%, 56%)`;
}

export function SongVoiceGrid({ songs }: { songs: VoiceSong[] }) {
  const [compassOpen, setCompassOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const startRef = useRef(0);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  // Stop any preview if the component unmounts (e.g. navigation).
  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      audio?.pause();
    };
  }, []);

  const toggle = (song: VoiceSong) => {
    const audio = audioRef.current;
    if (!audio || !song.streamingUrl) return;
    if (playingId === song.id) {
      audio.pause();
      setPlayingId(null);
      return;
    }
    audio.src = song.streamingUrl;
    const dur = song.durationSeconds || 0;
    const start = dur > PREVIEW_START + 5 ? PREVIEW_START : 0;
    startRef.current = start;
    audio.currentTime = start;
    setProgress(0);
    audio
      .play()
      .then(() => setPlayingId(song.id))
      .catch(() => setPlayingId(null));
  };

  const onTime = () => {
    const audio = audioRef.current;
    if (!audio) return;
    const elapsed = audio.currentTime - startRef.current;
    if (elapsed >= PREVIEW_DURATION) {
      audio.pause();
      setPlayingId(null);
      setProgress(0);
      return;
    }
    setProgress(Math.min(1, Math.max(0, elapsed / PREVIEW_DURATION)));
  };

  const onEnded = () => {
    setPlayingId(null);
    setProgress(0);
  };

  if (songs.length === 0) return null;

  return (
    <>
      <audio ref={audioRef} preload="none" onTimeUpdate={onTime} onEnded={onEnded} />
      <div className="sw-song-grid">
        {songs.map((s) => (
          <VoiceCard
            key={s.id}
            song={s}
            isPlaying={playingId === s.id}
            progress={playingId === s.id ? progress : 0}
            onToggle={() => toggle(s)}
            onExplain={() => setCompassOpen(true)}
          />
        ))}
      </div>
      {compassOpen && <CompassModal onClose={() => setCompassOpen(false)} />}
    </>
  );
}

function VoiceCard({
  song,
  isPlaying,
  progress,
  onToggle,
  onExplain,
}: {
  song: VoiceSong;
  isPlaying: boolean;
  progress: number;
  onToggle: () => void;
  onExplain: () => void;
}) {
  const canPlay = !!song.streamingUrl;

  const handleMove = (e: React.MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--tooltip-x", `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty("--tooltip-y", `${e.clientY - r.top}px`);
  };

  const onPlayClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (canPlay) onToggle();
  };

  const sign = (song.rcCharge ?? 0) > 0 ? "+" : "";
  // Prefer the real Rising Compass tier color; fall back to the charge gradient.
  const chargeHex =
    song.rcColor || (song.rcCharge != null ? chargeColor(song.rcCharge) : "transparent");

  return (
    <div className="sw-song-card">
      <div
        className={`sw-song-card__art-wrap${song.summary ? " sw-song-card__art-wrap--has-tip" : ""}`}
        data-summary={song.summary || undefined}
        onMouseMove={song.summary ? handleMove : undefined}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="sw-song-card__art"
          src={song.artUrl || "/placeholder-art.webp"}
          alt={song.artAlt || song.title}
        />
        {canPlay && (
          <button
            type="button"
            className={`sw-song-card__play${isPlaying ? " sw-song-card__play--current sw-song-card__play--playing" : ""}`}
            style={isPlaying ? ({ "--ring": `${Math.round(progress * 360)}deg` } as React.CSSProperties) : undefined}
            onClick={onPlayClick}
            aria-label={isPlaying ? `Pause preview of ${song.title}` : `Play preview of ${song.title}`}
          >
            <span className="sw-song-card__play-icon" aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="sw-song-card__meta">
        <span className="sw-song-card__title">{song.title}</span>
        {song.rcCharge != null && (
          <button
            type="button"
            className="sw-song-card__charge"
            style={{ color: chargeHex, borderColor: chargeHex }}
            title="What is this?"
            onClick={onExplain}
          >
            {sign}
            {song.rcCharge}
          </button>
        )}
      </div>

      <a href={`/music/songs/${song.slug}`} className="sw-song-card__cta">
        Explore Song
      </a>
    </div>
  );
}

function CompassModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="sw-compass-modal"
      role="dialog"
      aria-modal="true"
      aria-label="What is the Rising Compass"
      onClick={onClose}
    >
      <div className="sw-compass-modal__panel" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="sw-compass-modal__close" onClick={onClose} aria-label="Close">
          &times;
        </button>
        <h2 className="sw-compass-modal__title">The Rising Compass</h2>
        <p>
          The Rising Compass is a free tool I built that reads a song&rsquo;s lyrics and scores the
          message it carries &mdash; from +100 (Ascended) down to -100 (Corrupted). It&rsquo;s not
          about whether a song is catchy; it&rsquo;s about what the song is actually saying. The
          number on each card is that charge. I only write songs that land from decent to ascended.
        </p>
        <a
          className="sw-compass-modal__link"
          href="https://risingcompass.net"
          target="_blank"
          rel="noopener noreferrer"
        >
          Explore the Rising Compass &rarr;
        </a>
      </div>
    </div>
  );
}
