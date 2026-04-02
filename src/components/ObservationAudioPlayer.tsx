"use client";

import { useRef, useState, useEffect, useCallback } from "react";

interface ObservationAudioPlayerProps {
  src: string;
  title: string;
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function ObservationAudioPlayer({ src, title }: ObservationAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const tick = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || audio.paused) return;
    setCurrentTime(audio.currentTime);
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    function onLoadedMetadata() {
      setDuration(audio!.duration);
      setLoaded(true);
    }
    function onEnded() {
      setPlaying(false);
      setCurrentTime(0);
      cancelAnimationFrame(rafRef.current);
    }
    function onPlay() {
      setPlaying(true);
      rafRef.current = requestAnimationFrame(tick);
    }
    function onPause() {
      setPlaying(false);
      cancelAnimationFrame(rafRef.current);
    }

    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);

    // Set up Media Session API
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title,
        artist: "Chad Lewine",
      });
      navigator.mediaSession.setActionHandler("play", () => audio.play());
      navigator.mediaSession.setActionHandler("pause", () => audio.pause());
      navigator.mediaSession.setActionHandler("seekto", (details) => {
        if (details.seekTime != null) audio.currentTime = details.seekTime;
      });
    }

    return () => {
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      cancelAnimationFrame(rafRef.current);
    };
  }, [tick, title]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play();
    } else {
      audio.pause();
    }
  }

  function handleScrub(e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) {
    const audio = audioRef.current;
    const bar = progressRef.current;
    if (!audio || !bar || !duration) return;

    const rect = bar.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    audio.currentTime = pct * duration;
    setCurrentTime(audio.currentTime);
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="obs-audio">
      <audio ref={audioRef} src={src} preload="metadata" />

      <button
        className="obs-audio__play-btn"
        onClick={togglePlay}
        aria-label={playing ? "Pause" : "Play"}
      >
        {playing ? (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <rect x="3" y="2" width="4" height="12" rx="1" />
            <rect x="9" y="2" width="4" height="12" rx="1" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4 2.5v11l9-5.5z" />
          </svg>
        )}
      </button>

      <div className="obs-audio__info">
        <span className="obs-audio__label">Listen</span>
        <div
          className="obs-audio__bar"
          ref={progressRef}
          onClick={handleScrub}
          onTouchStart={handleScrub}
          role="slider"
          aria-valuenow={Math.round(currentTime)}
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          tabIndex={0}
        >
          <div className="obs-audio__bar-fill" style={{ width: `${progress}%` }} />
          <div className="obs-audio__bar-thumb" style={{ left: `${progress}%` }} />
        </div>
        <div className="obs-audio__time">
          <span>{formatTime(currentTime)}</span>
          <span>{loaded ? formatTime(duration) : "--:--"}</span>
        </div>
      </div>
    </div>
  );
}
