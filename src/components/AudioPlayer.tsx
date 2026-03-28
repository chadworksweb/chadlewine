"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface Album {
  id: string;
  title: string;
  slug: string;
  release_date: string | null;
  cover_art_path: string | null;
}

interface Track {
  id: string;
  album_id: string;
  title: string;
  slug: string;
  track_number: number;
  duration_seconds: number | null;
  streaming_path: string | null;
  price_cents: number | null;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function AudioPlayer({ albums, tracks }: { albums: Album[]; tracks: Track[] }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [selectedAlbum, setSelectedAlbum] = useState<string>(albums[0]?.id || "");

  const albumTracks = tracks.filter((t) => t.album_id === selectedAlbum);
  const currentAlbum = albums.find((a) => a.id === selectedAlbum);

  const playTrack = useCallback((track: Track) => {
    if (!track.streaming_path) return;
    setCurrentTrack(track);
    setPlaying(true);
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack?.streaming_path) return;

    audio.src = currentTrack.streaming_path;
    audio.play().catch(() => setPlaying(false));
  }, [currentTrack]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTime = () => setCurrentTime(audio.currentTime);
    const onDur = () => setDuration(audio.duration);
    const onEnd = () => {
      // Auto-advance to next track
      if (currentTrack) {
        const idx = albumTracks.findIndex((t) => t.id === currentTrack.id);
        if (idx < albumTracks.length - 1) {
          playTrack(albumTracks[idx + 1]);
        } else {
          setPlaying(false);
        }
      }
    };

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onDur);
    audio.addEventListener("ended", onEnd);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onDur);
      audio.removeEventListener("ended", onEnd);
    };
  }, [currentTrack, albumTracks, playTrack]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) { audio.pause(); setPlaying(false); }
    else { audio.play().catch(() => {}); setPlaying(true); }
  }

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    audio.currentTime = pct * duration;
  }

  // Media Session API
  useEffect(() => {
    if (!("mediaSession" in navigator) || !currentTrack) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title,
      artist: "Chad Lewine",
      album: currentAlbum?.title || "",
      artwork: currentAlbum?.cover_art_path
        ? [{ src: currentAlbum.cover_art_path, sizes: "512x512", type: "image/webp" }]
        : [],
    });
  }, [currentTrack, currentAlbum]);

  return (
    <div className="sap">
      <audio ref={audioRef} preload="none" />

      {/* Album selector */}
      <div className="sap__albums">
        {albums.map((a) => (
          <button
            key={a.id}
            className={`sap__album-btn${selectedAlbum === a.id ? " sap__album-btn--active" : ""}`}
            onClick={() => setSelectedAlbum(a.id)}
          >
            {a.cover_art_path && (
              <img src={a.cover_art_path} alt={a.title} className="sap__album-art" />
            )}
            <span className="sap__album-title">{a.title}</span>
            {a.release_date && <span className="sap__album-year">{a.release_date.slice(0, 4)}</span>}
          </button>
        ))}
      </div>

      {/* Transport controls */}
      <div className="sap__transport">
        <div className="sap__display">
          <span className="sap__now-playing">
            {currentTrack ? currentTrack.title : "No track selected"}
          </span>
          <span className="sap__time">
            {currentTrack ? `${formatTime(currentTime)} / ${formatTime(duration || 0)}` : "--:-- / --:--"}
          </span>
        </div>

        <div className="sap__scrubber" onClick={seek}>
          <div className="sap__scrubber-fill" style={{ width: duration ? `${(currentTime / duration) * 100}%` : "0%" }} />
        </div>

        <div className="sap__controls">
          <button className="sap__btn" onClick={togglePlay} disabled={!currentTrack}>
            {playing ? "Pause" : "Play"}
          </button>
        </div>
      </div>

      {/* Track list */}
      <div className="sap__tracklist">
        {albumTracks.map((t) => (
          <button
            key={t.id}
            className={`sap__track${currentTrack?.id === t.id ? " sap__track--active" : ""}${!t.streaming_path ? " sap__track--disabled" : ""}`}
            onClick={() => playTrack(t)}
            disabled={!t.streaming_path}
          >
            <span className="sap__track-num">{t.track_number}</span>
            <span className="sap__track-title">{t.title}</span>
            <span className="sap__track-dur">
              {t.duration_seconds ? formatTime(t.duration_seconds) : "--:--"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
