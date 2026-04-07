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

export function FeaturedTrack({ song, playbackMode = "preview" }: FeaturedTrackProps) {
  if (!song.streaming_path || !song.duration_seconds) return null;

  return (
    <MiniPlayer
      streamingUrl={song.streaming_path}
      trackNumber={song.track_number}
      trackTitle={song.title}
      durationSeconds={song.duration_seconds}
      playbackMode={playbackMode}
    />
  );
}
