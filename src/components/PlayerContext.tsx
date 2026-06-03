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
import { PlayLimitModal } from "@/components/PlayLimitModal";
import { analyticsAllowed } from "@/lib/consent";

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
// Seconds a listener must hear before a play counts toward the anonymous
// per-song limit. Independent of the analytics threshold (PLAY_MIN_SECONDS)
// and of PREVIEW_DURATION -- it just happens to share preview's 30s today.
const GATE_PLAY_THRESHOLD = 30;

// --- Visualizer playback-clock tuning levers (visual sync only) ---
// Residual constant lookahead, in ms, added on top of the interpolated clock.
// The interpolated clock removes iOS's stale-currentTime stepping; if a small
// constant lag REMAINS on a device (output latency, Bluetooth route), bump
// this so the cube reads slightly ahead and lands on the beat. 0 = off.
// Affects ONLY getCurrentTime() (the visualizer); never the progress bar.
// 200ms dialed in on iPhone 15 Pro (Chrome/Safari, iOS) -- compensates the
// device output latency on top of the interpolated clock; timing locked dead
// on the kick at this value. Other devices can override live via ?lat=NN.
const VISUAL_LATENCY_COMP_MS = 200;
// Live-tunable override of the above. Set on the client from a `?lat=NN` URL
// param (ms) or the cv_lat_ms localStorage key, so the compensation can be
// dialed in on a real device WITHOUT a rebuild -- change the number, reload.
// Whatever value locks the cube to the audio becomes the new
// VISUAL_LATENCY_COMP_MS default before shipping.
let runtimeLatencyCompMs = VISUAL_LATENCY_COMP_MS;
// Hard cap on how far the interpolated clock may run past the last real
// currentTime sample (seconds). Protects against a buffering stall where the
// underlying currentTime freezes -- without this the visual clock would keep
// advancing off performance.now() and desync. One timeupdate cadence + margin.
const MAX_CLOCK_EXTRAPOLATION_S = 0.35;

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
  // Anonymous play-gate bookkeeping for the current listen. gatedListenRef =
  // this listen should count toward the per-song limit (anonymous, under the
  // cap). countedListenRef = it has already been recorded (after crossing the
  // threshold), so we don't double-count across rAF ticks or pause/resume.
  const gatedListenRef = useRef(false);
  const countedListenRef = useRef(false);
  // Interpolated playback clock for the visualizer. iOS WebKit (Safari AND
  // Chrome, which is WKWebView) only advances <audio>.currentTime at the
  // ~250ms `timeupdate` cadence rather than continuously like desktop, so a
  // per-frame read sees a STALE time between updates -- the cube lags the
  // audio by up to a quarter second (perceived ~400ms once stacked with
  // output latency). We anchor each genuine currentTime update to a
  // performance.now() timestamp and extrapolate smoothly between updates so
  // getCurrentTime() returns a continuous, low-latency playback position on
  // every platform. `media` is the last real currentTime we saw; `perf` is
  // the performance.now() at which we saw it.
  const clockRef = useRef<{ media: number; perf: number }>({ media: 0, perf: 0 });

  const [current, setCurrent] = useState<PlayerSong | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resolvedDuration, setResolvedDuration] = useState(0);
  const [audioTime, setAudioTime] = useState(0);
  // Set when an anonymous device is over the per-song play limit; drives the
  // sign-in/buy modal. Playback does not start while this is set.
  const [blockedSong, setBlockedSong] = useState<PlayerSong | null>(null);

  // Pick up a live latency-compensation override on the client so the
  // visualizer sync can be dialed in on a real device without a rebuild.
  // Priority: ?lat=NN URL param (also persisted) > cv_lat_ms localStorage >
  // the VISUAL_LATENCY_COMP_MS default. Sweep values by changing the number
  // and reloading; whatever locks the cube becomes the shipped default.
  useEffect(() => {
    try {
      const param = new URLSearchParams(window.location.search).get("lat");
      if (param !== null && param !== "" && !Number.isNaN(Number(param))) {
        runtimeLatencyCompMs = Number(param);
        window.localStorage.setItem("cv_lat_ms", String(runtimeLatencyCompMs));
        return;
      }
      const stored = window.localStorage.getItem("cv_lat_ms");
      if (stored !== null && !Number.isNaN(Number(stored))) {
        runtimeLatencyCompMs = Number(stored);
      }
    } catch {
      /* SSR / no storage -- keep the compiled default */
    }
  }, []);

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

    // Analytics write (song_play_events + PostHog) is gated by consent (+ admin
    // opt-out). NOTE: the access-control play GATE below (checkGate) stays
    // admin-only and is NOT consent-gated -- declining analytics must not grant
    // unlimited free plays.
    if (!analyticsAllowed()) return;

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

  // Anonymous per-song play gate. Called at the start of a fresh play (not on
  // resume). Returns true if this device is over the limit and playback should
  // be blocked. Fails OPEN: any error (network/gate) returns false so a gate
  // problem can never silently break the player. The server exempts logged-in
  // fans; admin/test browsers that opt out of analytics skip the gate here.
  const checkGate = useCallback(
    async (songId: string): Promise<{ blocked: boolean; unlimited: boolean }> => {
      // Admin/test browsers opt out of the gate (and recording) entirely.
      if (typeof window !== "undefined") {
        try {
          if (localStorage.getItem("cl_skip_analytics") === "1") {
            return { blocked: false, unlimited: true };
          }
        } catch {}
      }
      try {
        const res = await fetch("/api/play/gate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ song_id: songId, action: "check" }),
        });
        if (!res.ok) return { blocked: false, unlimited: false };
        const data = await res.json();
        return { blocked: !!data.blocked, unlimited: !!data.unlimited };
      } catch {
        return { blocked: false, unlimited: false };
      }
    },
    [],
  );

  // Fire-and-forget increment of the per-song gate counter. Called from tick
  // once a gated listen crosses GATE_PLAY_THRESHOLD seconds (guarded by
  // countedListenRef so it runs at most once per listen). Failures are ignored
  // -- the gate is a soft nudge, not DRM.
  const recordPlay = useCallback((songId: string) => {
    try {
      fetch("/api/play/gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ song_id: songId, action: "record" }),
        keepalive: true,
      }).catch(() => {});
    } catch {}
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

      // Gate: a play counts toward the anonymous per-song limit only once the
      // listener has heard GATE_PLAY_THRESHOLD seconds. Record once per listen.
      if (
        gatedListenRef.current &&
        !countedListenRef.current &&
        session.secondsPlayed >= GATE_PLAY_THRESHOLD
      ) {
        countedListenRef.current = true;
        recordPlay(song.id);
      }
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
  }, [stop, recordPlay]);

  // Tears down any current playback and starts `song` fresh. Split out from
  // play() so the anonymous play-gate can run (async) before we disturb what's
  // already playing -- a blocked selection must leave the current track alone.
  const startFresh = useCallback(
    (song: PlayerSong) => {
      const audio = audioRef.current;
      if (!audio) return;

      // New listen: clear the "already recorded" flag. gatedListenRef is set
      // by play() from the check response just before this runs.
      countedListenRef.current = false;

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

      // Different song. Anonymous visitors are capped per song; the gate also
      // records the play. Logged-in fans and opted-out admin browsers pass
      // through, and checkGate fails open so a gate error never blocks audio.
      void checkGate(song.id).then(({ blocked, unlimited }) => {
        if (blocked) {
          setBlockedSong(song);
          return;
        }
        // Anonymous and under the cap -> this listen should count once it
        // crosses the threshold. Logged-in / opted-out listens never count.
        gatedListenRef.current = !unlimited;
        startFresh(song);
      });
    },
    [tick, checkGate, startFresh],
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
    const audio = audioRef.current;
    if (!audio) return 0;
    const raw = audio.currentTime;
    // Paused: no interpolation, report the true position and re-anchor so the
    // next play resumes cleanly.
    if (audio.paused) {
      clockRef.current.media = raw;
      clockRef.current.perf = performance.now();
      return raw;
    }
    const now = performance.now();
    const c = clockRef.current;
    // A genuine currentTime update arrived (or the stream seeked): re-anchor.
    // `raw !== c.media` catches every real tick; the 0.25s guard re-anchors on
    // seeks/drift so extrapolation can't run away from reality.
    if (raw !== c.media || Math.abs(raw - (c.media + (now - c.perf) / 1000)) > 0.25) {
      c.media = raw;
      c.perf = now;
      return raw + runtimeLatencyCompMs / 1000;
    }
    // Between updates: extrapolate from the last anchor using the high-res
    // clock. Clamp the extrapolation so a stalled/buffering stream (currentTime
    // frozen) doesn't let the visual clock sprint ahead.
    const extrapolated = Math.min((now - c.perf) / 1000, MAX_CLOCK_EXTRAPOLATION_S);
    return c.media + extrapolated + runtimeLatencyCompMs / 1000;
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
      {blockedSong && (
        <PlayLimitModal
          song={{ title: blockedSong.title, slug: blockedSong.slug }}
          onClose={() => setBlockedSong(null)}
        />
      )}
    </PlayerContext.Provider>
  );
}
