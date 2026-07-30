"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  streamPlaylistUrl,
  streamThumbnailUrl,
  streamIframeUrl,
} from "@/lib/bunny-stream";

export interface PantheonVideo {
  id: string;
  title: string;
  slug: string;
  category_id: string | null;
  stream_id: string | null;
  embed_url: string | null;
  thumbnail_path: string | null;
  description: string | null;
  is_featured: boolean;
  duration_seconds: number | null;
  published_at?: string | null;
  categoryTitle?: string | null;
}

// "native"  -> our <video> + hls.js, full transport deck (the true TVP).
// "embed"   -> a third-party iframe (YouTube/Vimeo, or Bunny iframe fallback
//              before a CDN host is configured); Bunny/YT controls live inside.
// "empty"   -> no playable source.
type Mode = "native" | "embed" | "empty";

function resolveMode(v: PantheonVideo | null): { mode: Mode; src: string | null } {
  if (!v) return { mode: "empty", src: null };
  const playlist = streamPlaylistUrl(v.stream_id);
  if (playlist) return { mode: "native", src: playlist };
  if (v.embed_url) return { mode: "embed", src: v.embed_url };
  const iframe = streamIframeUrl(v.stream_id);
  if (iframe) return { mode: "embed", src: iframe };
  return { mode: "empty", src: null };
}

function posterFor(v: PantheonVideo | null): string | null {
  if (!v) return null;
  return v.thumbnail_path || streamThumbnailUrl(v.stream_id);
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

function formatDate(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long" });
}

interface Props {
  video: PantheonVideo | null;
  onShare?: (video: PantheonVideo) => void;
  showDate?: boolean;
}

type LoadState = "idle" | "loading" | "ready" | "error";

export function PantheonStage({ video, onShare, showDate = true }: Props) {
  const { mode, src } = resolveMode(video);
  const poster = posterFor(video);

  const screenRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<{ destroy(): void } | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);

  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [started, setStarted] = useState(false); // play pressed at least once
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(video?.duration_seconds ?? 0);
  const [buffered, setBuffered] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [scanlines, setScanlines] = useState(false);
  const [copied, setCopied] = useState(false);
  // Transport drawer auto-hide: stays up for a beat after the cursor last moved
  // over the video, then drops away during uninterrupted playback.
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef<number | null>(null);

  const CONTROLS_IDLE_MS = 2600;
  const pokeControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    if (isPlaying) {
      hideTimerRef.current = window.setTimeout(() => setControlsVisible(false), CONTROLS_IDLE_MS);
    }
  }, [isPlaying]);
  const onScreenLeave = useCallback(() => {
    if (isPlaying) {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
      setControlsVisible(false);
    }
  }, [isPlaying]);

  // ---- Attach the HLS source (native mode only) ----------------------------
  useEffect(() => {
    if (mode !== "native" || !src) return;
    const el = videoRef.current;
    if (!el) return;

    // NOT "loading" yet. Safari takes the native branch below, where the only
    // thing that happens is setting src on a preload="metadata" element, so
    // nothing is fetched until the viewer asks for it and a spinner would be
    // claiming work that is not happening. hls.js starts pulling the moment
    // loadSource runs, so that branch turns it on for itself.
    setLoadState("idle");
    setStarted(false);
    setPosition(0);
    let cancelled = false;

    async function init() {
      if (!el) return;
      // Safari (iOS + macOS) plays HLS natively via the src; it runs Apple's
      // own adaptive-bitrate ladder.
      if (el.canPlayType("application/vnd.apple.mpegurl") !== "") {
        el.src = src!;
        return;
      }
      // Everyone else: hls.js (its default ABR controller handles bandwidth
      // switching). Dynamic import keeps it out of the bundle for Safari.
      try {
        const Hls = (await import("hls.js")).default;
        if (cancelled || !el) return;
        if (!Hls.isSupported()) {
          setLoadState("error");
          return;
        }
        // This one really is loading: loadSource fetches immediately.
        setLoadState("loading");
        const hls = new Hls();
        hlsRef.current = hls as unknown as { destroy(): void };
        hls.loadSource(src!);
        hls.attachMedia(el);
        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (data.fatal) {
            console.error("[pantheon] fatal HLS error", data);
            setLoadState("error");
          }
        });
      } catch (e) {
        console.error("[pantheon] failed to init hls.js", e);
        setLoadState("error");
      }
    }
    init();

    return () => {
      cancelled = true;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (el) {
        el.removeAttribute("src");
        el.load();
      }
    };
  }, [mode, src]);

  // ---- <video> event wiring (native mode) ----------------------------------
  useEffect(() => {
    if (mode !== "native") return;
    const el = videoRef.current;
    if (!el) return;

    // METADATA IS A READINESS SIGNAL, not just a duration. `canplay` waits until
    // enough frames are buffered to actually start, which an element left at
    // preload="metadata" never reaches on its own, so keying readiness to
    // canplay alone left Safari spinning forever on a video it was perfectly
    // able to play the moment it was asked. Safari is exactly the browser that
    // takes the native branch above, which is why this only ever showed on iOS.
    const onReady = () => setLoadState((s) => (s === "error" ? s : "ready"));
    const onTime = () => setPosition(el.currentTime);
    const onMeta = () => {
      if (el.duration && Number.isFinite(el.duration)) setDuration(el.duration);
      onReady();
    };
    const onProgress = () => {
      try {
        if (el.buffered.length) setBuffered(el.buffered.end(el.buffered.length - 1));
      } catch {
        /* buffered can throw before metadata; ignore */
      }
    };
    const onPlay = () => { setIsPlaying(true); setStarted(true); };
    const onPause = () => setIsPlaying(false);
    const onEnded = () => { setIsPlaying(false); setPosition(el.duration || 0); };
    const onErr = () => setLoadState("error");

    // The element can already hold metadata by the time this binds (a cached
    // video, or a remount against a src it still has), and that event is long
    // gone. Read the state instead of waiting for a repeat that never comes.
    if (el.readyState >= 1 /* HAVE_METADATA */) onReady();

    el.addEventListener("canplay", onReady);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("progress", onProgress);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnded);
    el.addEventListener("error", onErr);
    return () => {
      el.removeEventListener("canplay", onReady);
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("progress", onProgress);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onEnded);
      el.removeEventListener("error", onErr);
    };
  }, [mode, src]);

  // Reset duration baseline when the video changes.
  useEffect(() => {
    setDuration(video?.duration_seconds ?? 0);
    setBuffered(0);
    setCopied(false);
  }, [video?.id, video?.duration_seconds]);

  // When playback starts, begin the idle countdown so the drawer slides away on
  // its own; when paused, keep it up and cancel any pending hide.
  useEffect(() => {
    if (!isPlaying) {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
      setControlsVisible(true);
      return;
    }
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => setControlsVisible(false), CONTROLS_IDLE_MS);
    return () => {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    };
  }, [isPlaying]);

  // On play, bring the screen to the vertical centre of the viewport so the
  // video becomes the focus (the temple top/hero scroll up out of the way).
  useEffect(() => {
    if (!isPlaying) return;
    screenRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [isPlaying]);

  // ---- Fullscreen ----------------------------------------------------------
  useEffect(() => {
    const onFsChange = () =>
      setIsFullscreen(document.fullscreenElement === screenRef.current);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const togglePlay = useCallback(async () => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      try { await el.play(); } catch (e) { console.error("[pantheon] play() rejected", e); }
    } else {
      el.pause();
    }
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = screenRef.current;
    if (!el) return;
    if (document.fullscreenElement === el) document.exitFullscreen();
    else el.requestFullscreen?.();
  }, []);

  const seekTo = useCallback((clientX: number) => {
    const track = trackRef.current;
    const el = videoRef.current;
    if (!track || !el || !duration) return;
    const r = track.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    el.currentTime = pct * duration;
    setPosition(el.currentTime);
  }, [duration]);

  const onTrackPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    seekTo(e.clientX);
    const move = (ev: PointerEvent) => seekTo(ev.clientX);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }, [seekTo]);

  // ---- Keyboard (native mode, when the stage has focus) --------------------
  const onStageKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (mode !== "native") return;
    const el = videoRef.current;
    if (!el) return;
    if (e.key === " " || e.key === "k") { e.preventDefault(); togglePlay(); }
    else if (e.key === "f") { e.preventDefault(); toggleFullscreen(); }
    else if (e.key === "ArrowRight") { e.preventDefault(); el.currentTime = Math.min(duration, el.currentTime + 5); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); el.currentTime = Math.max(0, el.currentTime - 5); }
  }, [mode, duration, togglePlay, toggleFullscreen]);

  const handleShare = useCallback(() => {
    if (video && onShare) onShare(video);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }, [video, onShare]);

  const pct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;
  const bufPct = duration > 0 ? Math.min(100, (buffered / duration) * 100) : 0;
  const dateLabel = showDate ? formatDate(video?.published_at) : null;

  return (
    <div
      className={`pantheon${scanlines ? " is-crt" : ""}${isPlaying ? " is-playing" : ""}${controlsVisible ? " is-controls" : ""}`}
      data-mode={mode}
    >
      {/* Pediment */}
      <div className="pantheon__pediment" aria-hidden="true">
        <span className="pantheon__pediment-relief" />
      </div>

      {/* Colonnade: two fluted columns flanking the naos */}
      <div className="pantheon__colonnade">
        <span className="pantheon__column pantheon__column--left" aria-hidden="true" />

        <div
          className="pantheon__naos"
          ref={screenRef}
          tabIndex={mode === "native" ? 0 : -1}
          onKeyDown={onStageKeyDown}
          onMouseMove={mode === "native" ? pokeControls : undefined}
          onMouseLeave={mode === "native" ? onScreenLeave : undefined}
          aria-label={video ? video.title : "Video stage"}
        >
          <div className="pantheon__screen">
            {mode === "native" && (
              <video
                ref={videoRef}
                className="pantheon__video"
                playsInline
                preload="metadata"
                poster={poster ?? undefined}
                onClick={togglePlay}
              />
            )}

            {mode === "embed" && src && (
              <iframe
                key={src}
                className="pantheon__embed"
                src={src}
                title={video?.title || "Video"}
                allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                allowFullScreen
              />
            )}

            {/* CRT / scanline overlay -- never blocks pointer events */}
            <div className="pantheon__crt" aria-hidden="true" />

            {/* Poster + big-play (native, before first play). The poster layer
                is non-interactive; only the play circle reacts to the cursor. */}
            {mode === "native" && !started && (
              <div
                className="pantheon__placeholder"
                style={poster ? { backgroundImage: `url(${poster})` } : undefined}
              >
                <span className="pantheon__placeholder-veil" aria-hidden="true" />
                {loadState === "error" ? (
                  <span className="pantheon__signal">NO SIGNAL</span>
                ) : (
                  <button
                    type="button"
                    className="pantheon__bigplay"
                    onClick={togglePlay}
                    aria-label={video ? `Play ${video.title}` : "Play"}
                  >
                    <svg viewBox="0 0 24 24" width="46" height="46" fill="currentColor">
                      <path d="M7 4.5v15a1 1 0 0 0 1.55.83l11.5-7.5a1 1 0 0 0 0-1.66l-11.5-7.5A1 1 0 0 0 7 4.5z" />
                    </svg>
                  </button>
                )}
              </div>
            )}

            {mode === "empty" && (
              <div className="pantheon__placeholder pantheon__placeholder--empty">
                <span className="pantheon__signal">NO SIGNAL<small>Select a video</small></span>
              </div>
            )}

            {/* Transport drawer -- slides up from the bottom edge of the video,
                within the columns. Shown on hover/focus and whenever paused. */}
            {mode === "native" && (
              <div className="pantheon__drawer">
                <div
                  className="pantheon__seek"
                  ref={trackRef}
                  role="slider"
                  tabIndex={0}
                  aria-label="Seek"
                  aria-valuemin={0}
                  aria-valuemax={Math.round(duration)}
                  aria-valuenow={Math.round(position)}
                  onPointerDown={onTrackPointerDown}
                >
                  <span className="pantheon__seek-buffer" style={{ width: `${bufPct}%` }} />
                  <span className="pantheon__seek-fill" style={{ width: `${pct}%` }} />
                  <span className="pantheon__seek-head" style={{ left: `${pct}%` }} />
                </div>

                <div className="pantheon__transport">
            <button
              type="button"
              className="pantheon__btn pantheon__btn--play"
              onClick={togglePlay}
              disabled={loadState === "error"}
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {loadState === "loading" && !started ? (
                <svg viewBox="0 0 24 24" width="18" height="18">
                  <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeDasharray="14 42">
                    <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite" />
                  </circle>
                </svg>
              ) : isPlaying ? (
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                  <rect x="6" y="5" width="4" height="14" rx="1" />
                  <rect x="14" y="5" width="4" height="14" rx="1" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                  <path d="M7 4.5v15a1 1 0 0 0 1.55.83l11.5-7.5a1 1 0 0 0 0-1.66l-11.5-7.5A1 1 0 0 0 7 4.5z" />
                </svg>
              )}
            </button>

            <div className="pantheon__clock">
              <span>{formatTime(position)}</span>
              <span className="pantheon__clock-sep">/</span>
              <span>{formatTime(duration)}</span>
            </div>

            <div className="pantheon__deck-right">
              <button
                type="button"
                className={`pantheon__chip${scanlines ? " is-on" : ""}`}
                onClick={() => setScanlines((s) => !s)}
                aria-pressed={scanlines}
                title="Toggle CRT scanlines"
              >
                CRT
              </button>
              <button
                type="button"
                className="pantheon__btn pantheon__btn--sm"
                onClick={handleShare}
                aria-label="Copy link to this video"
                title="Copy link"
              >
                {copied ? (
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
                )}
              </button>
              <button
                type="button"
                className="pantheon__btn pantheon__btn--sm"
                onClick={toggleFullscreen}
                aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              >
                {isFullscreen ? (
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" /></svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" /></svg>
                )}
              </button>
                </div>
              </div>
            </div>
            )}
          </div>
        </div>

        <span className="pantheon__column pantheon__column--right" aria-hidden="true" />
      </div>

      {/* Plaque: the dedication beneath the stage */}
      {video && (
        <div className="pantheon__plaque">
          <h2 className="pantheon__plaque-title">{video.title}</h2>
          {(dateLabel || video.categoryTitle) && (
            <p className="pantheon__plaque-meta">
              {[video.categoryTitle, dateLabel].filter(Boolean).join("  ·  ")}
            </p>
          )}
          {mode === "embed" && (
            <div className="pantheon__plaque-actions">
              <button type="button" className="pantheon__plaque-share" onClick={handleShare}>
                {copied ? "Link copied" : "Share"}
              </button>
            </div>
          )}
          {video.description && (
            <p className="pantheon__plaque-desc">{video.description}</p>
          )}
        </div>
      )}
    </div>
  );
}
