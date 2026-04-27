"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type PlaybackMode = "preview" | "full";

export type PlayerSong = {
  id: string;
  slug: string;
  title: string;
  streamingUrl: string;
  durationSeconds: number;
  artImagePath: string | null;
  artAlt: string | null;
  playbackMode: PlaybackMode;
};

type PlayerContextValue = {
  current: PlayerSong | null;
  playing: boolean;
  loading: boolean;
  /** Display position in seconds, normalized to the active playback window */
  displayTime: number;
  /** Display duration in seconds (preview window or full track) */
  displayDuration: number;
  /** 0..1 fraction through the active window */
  progress: number;
  play: (song: PlayerSong) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  /** seek by fraction (0..1) within the active window */
  seek: (pct: number) => void;
  isCurrent: (id: string) => boolean;
};

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used within PlayerProvider");
  return ctx;
}

const PREVIEW_START = 13;
const PREVIEW_DURATION = 30;
const FADE_DURATION = 2;

export function PlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number>(0);
  const fadeInRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentRef = useRef<PlayerSong | null>(null);

  const [current, setCurrent] = useState<PlayerSong | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resolvedDuration, setResolvedDuration] = useState(0);
  const [audioTime, setAudioTime] = useState(0);

  // Lazy-create the audio element once on the client
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.preload = "metadata";
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (fadeInRef.current) clearInterval(fadeInRef.current);
      const a = audioRef.current;
      if (a) {
        a.pause();
        a.removeAttribute("src");
        a.load();
      }
    };
  }, []);

  const clearFadeIn = () => {
    if (fadeInRef.current) {
      clearInterval(fadeInRef.current);
      fadeInRef.current = null;
    }
  };

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    clearFadeIn();
    currentRef.current = null;
    setCurrent(null);
    setPlaying(false);
    setLoading(false);
    setAudioTime(0);
    setResolvedDuration(0);
  }, []);

  const tick = useCallback(() => {
    const audio = audioRef.current;
    const song = currentRef.current;
    if (!audio || audio.paused || !song) return;

    setAudioTime(audio.currentTime);

    if (song.playbackMode === "preview") {
      const elapsed = audio.currentTime - PREVIEW_START;
      const remaining = PREVIEW_DURATION - elapsed;
      if (remaining <= FADE_DURATION) {
        audio.volume = Math.max(0, remaining / FADE_DURATION);
      }
      if (elapsed >= PREVIEW_DURATION) {
        stop();
        return;
      }
    }

    rafRef.current = requestAnimationFrame(tick);
  }, [stop]);

  const play = useCallback(
    (song: PlayerSong) => {
      const audio = audioRef.current;
      if (!audio) return;

      // Same song: just resume if paused
      if (currentRef.current?.id === song.id) {
        if (audio.paused) {
          audio.play().then(() => {
            setPlaying(true);
            rafRef.current = requestAnimationFrame(tick);
          }).catch(() => {});
        }
        return;
      }

      // Different song: tear down + start fresh
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      clearFadeIn();
      audio.pause();

      currentRef.current = song;
      setCurrent(song);
      setPlaying(false);
      setLoading(true);
      setAudioTime(0);
      setResolvedDuration(song.durationSeconds || 0);

      audio.src = song.streamingUrl;

      const onLoadedMeta = () => {
        if (audio.duration && Number.isFinite(audio.duration)) {
          setResolvedDuration(audio.duration);
        }
      };
      const onCanPlay = () => {
        if (currentRef.current?.id !== song.id) return;
        if (song.playbackMode === "full") {
          audio.currentTime = 0;
          audio.volume = 1;
        } else {
          audio.currentTime = PREVIEW_START;
          audio.volume = 0;
        }
        audio.play().then(() => {
          setLoading(false);
          setPlaying(true);

          if (song.playbackMode === "preview") {
            // Fade in
            let vol = 0;
            const steps = 20;
            const stepMs = (FADE_DURATION * 1000) / steps;
            fadeInRef.current = setInterval(() => {
              vol += 1 / steps;
              if (vol >= 1) {
                audio.volume = 1;
                clearFadeIn();
              } else {
                audio.volume = vol;
              }
            }, stepMs);
          }

          rafRef.current = requestAnimationFrame(tick);
        }).catch(() => {
          setLoading(false);
          stop();
        });
      };
      const onEnded = () => stop();
      const onError = () => stop();

      audio.addEventListener("loadedmetadata", onLoadedMeta, { once: true });
      audio.addEventListener("canplay", onCanPlay, { once: true });
      audio.addEventListener("ended", onEnded, { once: true });
      audio.addEventListener("error", onError, { once: true });

      audio.load();
    },
    [stop, tick],
  );

  const pause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    setPlaying(false);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    clearFadeIn();
  }, []);

  const resume = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !currentRef.current) return;
    audio.play().then(() => {
      setPlaying(true);
      rafRef.current = requestAnimationFrame(tick);
    }).catch(() => {});
  }, [tick]);

  const seek = useCallback((pct: number) => {
    const audio = audioRef.current;
    const song = currentRef.current;
    if (!audio || !song) return;
    const clamped = Math.max(0, Math.min(1, pct));
    if (song.playbackMode === "preview") {
      audio.currentTime = PREVIEW_START + clamped * PREVIEW_DURATION;
    } else {
      const dur = resolvedDuration > 0 ? resolvedDuration : audio.duration || 0;
      if (dur > 0) audio.currentTime = clamped * dur;
    }
    setAudioTime(audio.currentTime);
  }, [resolvedDuration]);

  const isCurrent = useCallback((id: string) => currentRef.current?.id === id, []);

  // Derive display values
  const isPreview = current?.playbackMode === "preview";
  const displayDuration = isPreview
    ? PREVIEW_DURATION
    : resolvedDuration;
  const displayTime = isPreview
    ? Math.max(0, audioTime - PREVIEW_START)
    : audioTime;
  const progress = displayDuration > 0
    ? Math.max(0, Math.min(1, displayTime / displayDuration))
    : 0;

  return (
    <PlayerContext.Provider
      value={{
        current,
        playing,
        loading,
        displayTime,
        displayDuration,
        progress,
        play,
        pause,
        resume,
        stop,
        seek,
        isCurrent,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
}
