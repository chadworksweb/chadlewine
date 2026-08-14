"use client";

import Link from "next/link";
import { useCallback, useRef } from "react";
import { usePlayer, usePlayerTime } from "@/components/PlayerContext";
import "./StickyPlayer.css";

function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function PlayIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6 4h4v16H6zm8 0h4v16h-4z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

// The bar's fill and the clock readout are the only parts that move with
// playback. They subscribe; the artwork, title and buttons around them don't.
function SeekBar({
  barRef,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  barRef: React.RefObject<HTMLDivElement | null>;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: () => void;
}) {
  const { progress } = usePlayerTime();
  return (
    <div
      ref={barRef}
      className="cl-sticky-player__seek"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      role="slider"
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
    >
      <div className="cl-sticky-player__seek-fill" style={{ width: `${progress * 100}%` }} />
    </div>
  );
}

function TimeReadout({ isPreview }: { isPreview: boolean }) {
  const { displayTime, displayDuration } = usePlayerTime();
  return (
    <span className="cl-sticky-player__time">
      {formatTime(displayTime)} / {formatTime(displayDuration)}
      {isPreview && <span className="cl-sticky-player__preview-tag"> · Preview</span>}
    </span>
  );
}

export function StickyPlayer() {
  const {
    current,
    playing,
    loading,
    pause,
    resume,
    stop,
    seek,
  } = usePlayer();

  const barRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const seekFromEvent = useCallback(
    (clientX: number) => {
      const bar = barRef.current;
      if (!bar) return;
      const rect = bar.getBoundingClientRect();
      const pct = (clientX - rect.left) / rect.width;
      seek(pct);
    },
    [seek],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    draggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    seekFromEvent(e.clientX);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    seekFromEvent(e.clientX);
  };
  const onPointerUp = () => {
    draggingRef.current = false;
  };

  if (!current) return null;

  const isPreview = current.playbackMode === "preview";

  return (
    <div className="cl-sticky-player" role="region" aria-label="Now playing">
      <SeekBar
        barRef={barRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />

      <div className="cl-sticky-player__row">
        <Link
          href={`/music/songs/${current.slug}`}
          className="cl-sticky-player__info"
          aria-label={`Open ${current.title}`}
        >
          <div className="cl-sticky-player__art">
            {current.artImagePath ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={current.artImagePath}
                alt={current.artAlt || ""}
                className="cl-sticky-player__art-img"
                loading="lazy"
              />
            ) : (
              <span className="cl-sticky-player__art-placeholder" aria-hidden="true">♫</span>
            )}
            {loading && <span className="cl-sticky-player__spinner" aria-hidden="true" />}
          </div>

          <div className="cl-sticky-player__meta">
            <span className="cl-sticky-player__title">{current.title}</span>
            <TimeReadout isPreview={isPreview} />
          </div>
        </Link>

        <div className="cl-sticky-player__controls">
          <button
            type="button"
            className="cl-sticky-player__btn cl-sticky-player__btn--play"
            onClick={playing ? pause : resume}
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button
            type="button"
            className="cl-sticky-player__btn cl-sticky-player__btn--close"
            onClick={stop}
            aria-label="Stop and close player"
          >
            <CloseIcon />
          </button>
        </div>
      </div>
    </div>
  );
}
