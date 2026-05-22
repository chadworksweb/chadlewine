"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  slug: string;
  token: string;
  title: string;
  artistCredit: string;
  durationSeconds: number | null;
  // null/empty triggers placeholder monogram render.
  coverArtPath: string | null;
}

type LoadState = "loading" | "ready" | "error";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export function FanTrackPlayer({
  slug,
  token,
  title,
  artistCredit,
  durationSeconds,
  coverArtPath,
}: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hlsRef = useRef<{ destroy(): void } | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(durationSeconds ?? 0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const manifestUrl = `/api/for-my-fans/${slug}/manifest?token=${encodeURIComponent(token)}`;

    let cancelled = false;

    async function init() {
      if (!audio) return;
      // Safari (iOS + macOS) supports HLS natively via the audio src.
      const canNative = audio.canPlayType("application/vnd.apple.mpegurl") !== "";
      if (canNative) {
        audio.src = manifestUrl;
        return;
      }

      // Everything else needs hls.js. Dynamic import so the bundle only
      // grows for browsers that need it (~ everyone except Safari).
      try {
        const Hls = (await import("hls.js")).default;
        if (cancelled || !audio) return;
        if (!Hls.isSupported()) {
          setLoadState("error");
          return;
        }
        const hls = new Hls({
          // Don't try to recover from session-expiration errors silently —
          // they should bubble so the player shows an error state.
          xhrSetup: (xhr) => {
            xhr.withCredentials = true;
          },
        });
        hlsRef.current = hls as unknown as { destroy(): void };
        hls.loadSource(manifestUrl);
        hls.attachMedia(audio);
        hls.on(Hls.Events.ERROR, (_evt, data) => {
          if (data.fatal) {
            console.error("[fan-track-player] fatal HLS error", data);
            setLoadState("error");
          }
        });
      } catch (e) {
        console.error("[fan-track-player] failed to init hls.js", e);
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
    };
  }, [slug, token]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onCanPlay = () => setLoadState("ready");
    const onTimeUpdate = () => setPosition(audio.currentTime);
    const onLoadedMeta = () => {
      if (audio.duration && Number.isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      setIsPlaying(false);
      setPosition(audio.duration || 0);
    };
    const onError = () => setLoadState("error");

    audio.addEventListener("canplay", onCanPlay);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMeta);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    return () => {
      audio.removeEventListener("canplay", onCanPlay);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMeta);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
    };
  }, []);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      try {
        await audio.play();
      } catch (e) {
        console.error("[fan-track-player] play() rejected", e);
      }
    } else {
      audio.pause();
    }
  };

  const restart = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    setPosition(0);
  };

  const monogram = (title.trim()[0] || "C").toUpperCase();
  const pct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;

  return (
    <div className="for-my-fans-page__player">
      <div className="for-my-fans-page__art" aria-hidden="true">
        {coverArtPath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverArtPath}
            alt=""
            className="for-my-fans-page__art-img"
          />
        ) : (
          <span className="for-my-fans-page__art-monogram">{monogram}</span>
        )}
      </div>

      <div className="for-my-fans-page__player-body">
        <p className="for-my-fans-page__player-artist">{artistCredit}</p>
        <h1 className="for-my-fans-page__player-title">{title}</h1>

        <div
          className="for-my-fans-page__progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(position)}
        >
          <div
            className="for-my-fans-page__progress-fill"
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="for-my-fans-page__time">
          <span>{formatTime(position)}</span>
          <span>{formatTime(duration)}</span>
        </div>

        <div className="for-my-fans-page__controls">
          <button
            type="button"
            className="for-my-fans-page__btn for-my-fans-page__btn--play"
            onClick={togglePlay}
            disabled={loadState === "error"}
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            <span className="for-my-fans-page__btn-icon" aria-hidden="true">
              {loadState === "loading" ? (
                <svg viewBox="0 0 24 24" width="20" height="20">
                  <circle
                    cx="12"
                    cy="12"
                    r="9"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeDasharray="14 42"
                  >
                    <animateTransform
                      attributeName="transform"
                      type="rotate"
                      from="0 12 12"
                      to="360 12 12"
                      dur="1s"
                      repeatCount="indefinite"
                    />
                  </circle>
                </svg>
              ) : loadState === "error" ? (
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="6" y1="18" x2="18" y2="6" />
                </svg>
              ) : isPlaying ? (
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                  <rect x="6" y="5" width="4" height="14" rx="1" />
                  <rect x="14" y="5" width="4" height="14" rx="1" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                  <path d="M7 4.5v15a1 1 0 0 0 1.55.83l11.5-7.5a1 1 0 0 0 0-1.66l-11.5-7.5A1 1 0 0 0 7 4.5z" />
                </svg>
              )}
            </span>
          </button>
          <button
            type="button"
            className="for-my-fans-page__btn for-my-fans-page__btn--restart"
            onClick={restart}
            disabled={loadState !== "ready"}
            aria-label="Restart from the beginning"
          >
            Restart
          </button>
        </div>

        {loadState === "error" && (
          <p className="for-my-fans-page__error">
            Couldn&rsquo;t load this track. Try refreshing &mdash; if it
            keeps failing, email portal@chadlewine.com.
          </p>
        )}
      </div>

      <audio
        ref={audioRef}
        preload="metadata"
        // Hide native controls — the custom UI is the only way to interact.
        className="for-my-fans-page__audio-el"
      />
    </div>
  );
}
