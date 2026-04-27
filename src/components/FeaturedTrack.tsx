"use client";

import { MiniPlayer } from "@/components/MiniPlayer";

interface FeaturedTrackProps {
  song: {
    id: string;
    title: string;
    slug: string;
    track_number: number;
    duration_seconds: number | null;
    streaming_path: string | null;
    song_summary: string | null;
  };
  album: {
    title: string;
    slug: string;
    cover_art_path: string | null;
    cover_art_alt: string | null;
  };
  playbackMode?: "preview" | "full";
}

export function FeaturedTrack({ song, album, playbackMode = "preview" }: FeaturedTrackProps) {
  if (!song.streaming_path || !song.duration_seconds) return null;

  return (
    <MiniPlayer
      songId={song.id}
      songSlug={song.slug}
      streamingUrl={song.streaming_path}
      trackNumber={song.track_number}
      trackTitle={song.title}
      durationSeconds={song.duration_seconds}
      artImagePath={album.cover_art_path}
      artAlt={album.cover_art_alt || album.title}
      playbackMode={playbackMode}
    />
  );
}
