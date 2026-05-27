"use client";

import { useEffect, useRef, useState } from "react";
import "./SectionMessagePlayer.css";

interface SectionMessagePlayerProps {
  /** Caption shown beside the play button, e.g. "Why this exists". */
  label: string;
  /** Spoken-message audio URL. When null/empty the player renders a
     "coming soon" placeholder and is not playable. */
  audioUrl?: string | null;
  /** Optional known duration for the progress bar before metadata loads. */
  durationSeconds?: number;
}

/**
 * A compact, decorative "press to hear a note from Chad on this section"
 * mini player. Lives in normal flow at the top of a section. Distinct from
 * MiniPlayer (primary listening UI) and FrutigerMiniPlayer (song affordance
 * with a catalog detail link) - these are short spoken messages, not songs.
 */
export function SectionMessagePlayer({
  label,
  audioUrl,
  durationSeconds = 0,
}: SectionMessagePlayerProps) {
  const ready = !!audioUrl;
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(durationSeconds);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onMeta = () => {
      if (Number.isFinite(audio.duration)) setDuration(audio.duration);
    };
    const onEnd = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("ended", onEnd);
    return () => {
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("ended", onEnd);
    };
  }, [audioUrl]);

  // Drive the progress bar off requestAnimationFrame while playing (60fps)
  // instead of the audio `timeupdate` event (~4fps), so the fill moves smoothly.
  useEffect(() => {
    if (!isPlaying) return;
    let raf = 0;
    const tick = () => {
      const audio = audioRef.current;
      if (audio) setCurrentTime(audio.currentTime);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying]);

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      try {
        await audio.play();
        setIsPlaying(true);
      } catch {
        // play blocked - user can tap again
      }
    }
  };

  if (!ready) {
    return (
      <div className="section-msg section-msg--soon">
        <span className="section-msg__btn section-msg__btn--disabled" aria-hidden="true">
          <span className="section-msg__icon" />
        </span>
        <span className="section-msg__label">
          {label}
          <span className="section-msg__soon"> - a note from Chad, coming soon</span>
        </span>
      </div>
    );
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className={`section-msg${isPlaying ? " section-msg--playing" : ""}`}>
      <audio ref={audioRef} src={audioUrl as string} preload="metadata" />
      <button
        type="button"
        className="section-msg__btn"
        onClick={toggle}
        aria-label={isPlaying ? "Pause Chad's note" : `Play Chad's note: ${label}`}
      >
        <span
          className={`section-msg__icon${isPlaying ? " section-msg__icon--pause" : ""}`}
          aria-hidden="true"
        />
      </button>
      <span className="section-msg__label">{label}</span>
      <div className="section-msg__bar" aria-hidden={!isPlaying}>
        <div className="section-msg__bar-fill" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}
