"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import "./FrutigerMiniPlayer.css";

interface FrutigerMiniPlayerProps {
  songTitle: string;
  songSlug: string;
  streamingUrl: string;
  durationSeconds: number;
  artUrl?: string | null;
  artAlt?: string | null;
  /** Override base path for the song detail link. Defaults to /music/songs. */
  songPathPrefix?: string;
  /** Inline style forwarded to the wrapper — use to set position
     (top/right/bottom/left) or override the CSS custom properties
     `--frutiger-mini-top`, `--frutiger-mini-right`, etc. */
  style?: React.CSSProperties;
  className?: string;
}

function fmt(s: number): string {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}

export function FrutigerMiniPlayer({
  songTitle,
  songSlug,
  streamingUrl,
  durationSeconds,
  artUrl,
  artAlt,
  songPathPrefix = "/music/songs",
  style,
  className,
}: FrutigerMiniPlayerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setCurrentTime(audio.currentTime);
    const onEnd = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnd);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnd);
    };
  }, []);

  const playAudio = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      await audio.play();
      setIsPlaying(true);
    } catch {
      // Autoplay/play blocked — user can tap again.
    }
  };

  const pauseAudio = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    setIsPlaying(false);
  };

  const handleLauncher = async () => {
    if (!isOpen) {
      setIsOpen(true);
      await playAudio();
      return;
    }
    if (isPlaying) pauseAudio();
    else await playAudio();
  };

  const close = () => {
    pauseAudio();
    setIsOpen(false);
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !durationSeconds) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * durationSeconds;
    setCurrentTime(audio.currentTime);
  };

  const progress = durationSeconds > 0 ? (currentTime / durationSeconds) * 100 : 0;
  const songHref = `${songPathPrefix}/${songSlug}`;
  const wrapperClass =
    `frutiger-mini${isOpen ? " frutiger-mini--open" : ""}${className ? ` ${className}` : ""}`;

  return (
    <div className={wrapperClass} style={style}>
      <audio ref={audioRef} src={streamingUrl} preload="metadata" />

      <button
        type="button"
        className={`frutiger-mini__launcher${isPlaying ? " frutiger-mini__launcher--playing" : ""}`}
        onClick={handleLauncher}
        aria-label={
          isOpen ? (isPlaying ? "Pause" : "Play") : `Play "${songTitle}"`
        }
      >
        <span className="frutiger-mini__launcher-icon" aria-hidden="true" />
      </button>

      <div
        className="frutiger-mini__panel"
        role="dialog"
        aria-label={`Player: ${songTitle}`}
        aria-hidden={!isOpen}
      >
        <div className="frutiger-mini__panel-shine" aria-hidden="true" />
        <button
          type="button"
          className="frutiger-mini__close"
          onClick={close}
          aria-label="Close player"
        >
          &times;
        </button>

        <div className="frutiger-mini__panel-row">
          {artUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="frutiger-mini__art" src={artUrl} alt={artAlt || ""} />
          ) : (
            <div className="frutiger-mini__art frutiger-mini__art--placeholder" aria-hidden="true" />
          )}

          <div className="frutiger-mini__meta">
            <span className="frutiger-mini__eyebrow">Now Playing</span>
            <span className="frutiger-mini__title">
              <Link href={songHref} className="frutiger-mini__title-link">
                {songTitle}
              </Link>
            </span>
            <span className="frutiger-mini__time">
              {fmt(currentTime)} <span className="frutiger-mini__time-sep">/</span> {fmt(durationSeconds)}
            </span>
          </div>
        </div>

        <div
          className="frutiger-mini__bar"
          onClick={seek}
          role="slider"
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={durationSeconds}
          aria-valuenow={Math.floor(currentTime)}
          tabIndex={0}
        >
          <div className="frutiger-mini__bar-fill" style={{ width: `${progress}%` }} />
          <div className="frutiger-mini__bar-thumb" style={{ left: `${progress}%` }} aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
