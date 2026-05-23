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
import posthog from "posthog-js";

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
  /** Lazy-create a WebAudio AnalyserNode wired to the player's audio element.
   *  Returns null on browsers without WebAudio or when CORS prevents it.
   *  Safe to call from visualizers — same node is reused across calls. */
  getAnalyser: () => AnalyserNode | null;
  /** Returns the live audio element's currentTime in seconds — used by the
   *  visualizer's precomputed-beat scheduler which needs frame-accurate
   *  playback position (the public displayTime is throttled to 10Hz to keep
   *  re-renders cheap, so it's too coarse for beat triggers). Returns 0
   *  when no audio is loaded. */
  getCurrentTime: () => number;
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
const PLAY_MIN_SECONDS = 5;

type PlaySession = {
  songId: string;
  songSlug: string;
  songTitle: string;
  secondsPlayed: number;
  completed: boolean;
};

export function PlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const rafRef = useRef<number>(0);
  const fadeInRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentRef = useRef<PlayerSong | null>(null);
  const sessionRef = useRef<PlaySession | null>(null);
  // Tracks the last setAudioTime push so the rAF tick can throttle updates
  // to ~10 Hz. setState here re-renders every consumer of PlayerContext
  // (including the WebGL CubeVisualizer); doing that 60x/sec dropped frames
  // and made the progress bar lag visibly behind the audio. 100ms is far
  // faster than the eye perceives on a long progress fill.
  const lastAudioTimePushRef = useRef<number>(0);

  const [current, setCurrent] = useState<PlayerSong | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resolvedDuration, setResolvedDuration] = useState(0);
  const [audioTime, setAudioTime] = useState(0);

  // Lazy-create the audio element once on the client. crossOrigin must be set
  // BEFORE src for CORS to take effect on stream requests, which the WebAudio
  // analyser needs to read frequency data (else getByteFrequencyData returns
  // all zeros). Bunny pull zones return CORS headers so this is non-breaking.
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.crossOrigin = "anonymous";
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

  // Lazy WebAudio graph for visualizers. First caller after a user-gesture
  // play() will succeed; calls before any playback may also succeed (modern
  // browsers allow AudioContext creation, just suspended until resume()).
  const getAnalyser = useCallback((): AnalyserNode | null => {
    if (analyserRef.current) return analyserRef.current;
    if (typeof window === "undefined") return null;
    const audio = audioRef.current;
    if (!audio) return null;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    try {
      const ctx = audioCtxRef.current ?? new Ctx();
      audioCtxRef.current = ctx;
      const source = sourceNodeRef.current ?? ctx.createMediaElementSource(audio);
      sourceNodeRef.current = source;
      const analyser = ctx.createAnalyser();
      // fftSize 1024 -> 512 bins -> ~43Hz per bin at 44.1kHz sample rate.
      // The FFT window itself is only ~23ms long (vs 46ms at 2048), which
      // halves the inherent detection latency. We lose some sub-bass
      // resolution but bin 1 (43-86Hz) still captures the kick fundamental
      // cleanly. Smaller window = peak energy appears in the bin sooner
      // after a kick attack, so the detector fires closer to on-beat.
      analyser.fftSize = 1024;
      // No smoothing at all. Spectral-flux onset detection needs raw FFT
      // values to compute accurate frame-to-frame deltas; any smoothing
      // attenuates the attack edge that the detector is looking for.
      analyser.smoothingTimeConstant = 0;
      source.connect(analyser);
      analyser.connect(ctx.destination);
      analyserRef.current = analyser;
      return analyser;
    } catch {
      return null;
    }
  }, []);

  // Anonymous play-count recording. One row per session (>= PLAY_MIN_SECONDS).
  // Fans out to (a) /api/play -> song_play_events table (fast admin view) and
  // (b) PostHog (funnels: plays -> purchases). PostHog no-ops when uninitialized
  // or when opt_out_capturing is set. Admin browsers (cl_skip_analytics=1) are
  // blocked from both writes.
  const flushSession = useCallback(() => {
    const s = sessionRef.current;
    sessionRef.current = null;
    if (!s || s.secondsPlayed < PLAY_MIN_SECONDS) return;

    if (typeof window !== "undefined") {
      try {
        if (localStorage.getItem("cl_skip_analytics") === "1") return;
      } catch {}
    }

    const secondsPlayed = Math.floor(s.secondsPlayed);

    const body = JSON.stringify({
      song_id: s.songId,
      seconds_played: secondsPlayed,
      completed: s.completed,
    });
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      try {
        navigator.sendBeacon(
          "/api/play",
          new Blob([body], { type: "application/json" }),
        );
      } catch {
        fetch("/api/play", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        }).catch(() => {});
      }
    } else {
      fetch("/api/play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    }

    try {
      posthog.capture("song_played", {
        song_id: s.songId,
        song_slug: s.songSlug,
        song_title: s.songTitle,
        seconds_played: secondsPlayed,
        completed: s.completed,
      });
    } catch {
      // PostHog not initialized (dev / consent declined) — silently skip.
    }
  }, []);

  // Flush any in-flight session on tab close / navigation.
  useEffect(() => {
    const onUnload = () => flushSession();
    window.addEventListener("beforeunload", onUnload);
    window.addEventListener("pagehide", onUnload);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      window.removeEventListener("pagehide", onUnload);
    };
  }, [flushSession]);

  const clearFadeIn = () => {
    if (fadeInRef.current) {
      clearInterval(fadeInRef.current);
      fadeInRef.current = null;
    }
  };

  const stop = useCallback(() => {
    flushSession();
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    clearFadeIn();
    if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
      navigator.mediaSession.playbackState = "none";
      navigator.mediaSession.metadata = null;
    }
    currentRef.current = null;
    setCurrent(null);
    setPlaying(false);
    setLoading(false);
    setAudioTime(0);
    setResolvedDuration(0);
  }, [flushSession]);

  const tick = useCallback(function tickInner() {
    const audio = audioRef.current;
    const song = currentRef.current;
    if (!audio || audio.paused || !song) return;

    // Throttled state push — 100ms between updates is plenty for a
    // smooth-looking progress bar and saves ~5x the re-render cost.
    const nowMs = performance.now();
    if (nowMs - lastAudioTimePushRef.current >= 100) {
      lastAudioTimePushRef.current = nowMs;
      setAudioTime(audio.currentTime);
    }

    // Update the active session's max seconds heard (mode-normalized so
    // preview mode measures time inside the preview window, not raw currentTime).
    const session = sessionRef.current;
    if (session && session.songId === song.id) {
      const heard =
        song.playbackMode === "preview"
          ? Math.max(0, audio.currentTime - PREVIEW_START)
          : audio.currentTime;
      if (heard > session.secondsPlayed) session.secondsPlayed = heard;
    }

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

    rafRef.current = requestAnimationFrame(tickInner);
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
      flushSession();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      clearFadeIn();
      audio.pause();

      sessionRef.current = {
        songId: song.id,
        songSlug: song.slug,
        songTitle: song.title,
        secondsPlayed: 0,
        completed: false,
      };
      currentRef.current = song;
      setCurrent(song);
      setPlaying(false);
      setLoading(true);
      setAudioTime(0);
      setResolvedDuration(song.durationSeconds || 0);

      audio.src = song.streamingUrl;

      // Tell the OS this is real audio playback. Lockscreen on mobile
      // shows title/artist/artwork + play/pause/seek controls, and
      // iOS Safari stops auto-suspending the tab on screen lock once
      // MediaSession metadata is set.
      if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: song.title,
          artist: "Chad Lewine",
          artwork: song.artImagePath
            ? [
                { src: song.artImagePath, sizes: "512x512" },
                { src: song.artImagePath, sizes: "256x256" },
              ]
            : [],
        });
        navigator.mediaSession.playbackState = "playing";
      }

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
          // Resume any suspended AudioContext now that we're inside a user gesture
          // chain; without this, the visualizer analyser yields silent data on
          // browsers (Safari, some Chrome configs) that require explicit resume.
          if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
            audioCtxRef.current.resume().catch(() => {});
          }

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
      const onEnded = () => {
        if (sessionRef.current && sessionRef.current.songId === song.id) {
          sessionRef.current.completed = true;
        }
        stop();
      };
      const onError = () => stop();

      audio.addEventListener("loadedmetadata", onLoadedMeta, { once: true });
      audio.addEventListener("canplay", onCanPlay, { once: true });
      audio.addEventListener("ended", onEnded, { once: true });
      audio.addEventListener("error", onError, { once: true });

      audio.load();
    },
    [stop, tick, flushSession],
  );

  const pause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    setPlaying(false);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    clearFadeIn();
    if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
      navigator.mediaSession.playbackState = "paused";
    }
    // Commit the listening burst now — pagehide is unreliable on mobile and
    // never fires on Next client navigations, so a paused-then-walked-away
    // session would otherwise be silently dropped. /api/play has a 30s soft
    // dedupe on IP+UA to absorb any accidental re-fires.
    flushSession();
  }, [flushSession]);

  const resume = useCallback(() => {
    const audio = audioRef.current;
    const song = currentRef.current;
    if (!audio || !song) return;
    // pause() cleared sessionRef via flushSession — rebuild it so the resumed
    // burst is tracked as its own event.
    if (!sessionRef.current) {
      sessionRef.current = {
        songId: song.id,
        songSlug: song.slug,
        songTitle: song.title,
        secondsPlayed: 0,
        completed: false,
      };
    }
    audio.play().then(() => {
      setPlaying(true);
      if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
        navigator.mediaSession.playbackState = "playing";
      }
      rafRef.current = requestAnimationFrame(tick);
    }).catch(() => {});
  }, [tick]);

  // Register MediaSession action handlers AFTER pause/resume/stop are
  // defined so the closures point to current functions. Re-runs when
  // those callbacks change to avoid stale-closure bugs.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    ms.setActionHandler("play", () => { resume(); });
    ms.setActionHandler("pause", () => { pause(); });
    ms.setActionHandler("stop", () => { stop(); });
    ms.setActionHandler("seekbackward", () => {
      const a = audioRef.current;
      if (a) a.currentTime = Math.max(0, a.currentTime - 10);
    });
    ms.setActionHandler("seekforward", () => {
      const a = audioRef.current;
      if (a && Number.isFinite(a.duration)) {
        a.currentTime = Math.min(a.duration, a.currentTime + 10);
      }
    });
    return () => {
      ms.setActionHandler("play", null);
      ms.setActionHandler("pause", null);
      ms.setActionHandler("stop", null);
      ms.setActionHandler("seekbackward", null);
      ms.setActionHandler("seekforward", null);
    };
  }, [pause, resume, stop]);

  const seek = useCallback((pct: number) => {
    const audio = audioRef.current;
    const song = currentRef.current;
    if (!audio || !song) return;
    const clamped = Math.max(0, Math.min(1, pct));
    // Compute the target time we ASKED for and use that for the immediate
    // visual update. audio.currentTime read-back after assignment can be
    // delayed/snapped by the browser (CORS streams especially) which is
    // what made scrub clicks appear to "stick" or jump back to the wrong
    // position. We also reset the throttle so the next tick re-syncs
    // promptly with the audio's actual position.
    let target: number;
    if (song.playbackMode === "preview") {
      target = PREVIEW_START + clamped * PREVIEW_DURATION;
    } else {
      const dur = resolvedDuration > 0 ? resolvedDuration : audio.duration || 0;
      target = dur > 0 ? clamped * dur : 0;
    }
    audio.currentTime = target;
    lastAudioTimePushRef.current = 0;
    setAudioTime(target);
  }, [resolvedDuration]);

  const isCurrent = useCallback((id: string) => currentRef.current?.id === id, []);

  const getCurrentTime = useCallback(() => {
    return audioRef.current?.currentTime ?? 0;
  }, []);

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
        getAnalyser,
        getCurrentTime,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
}
