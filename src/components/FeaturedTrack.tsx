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
}

export function FeaturedTrack({ song }: FeaturedTrackProps) {
  if (!song.streaming_path || !song.duration_seconds) return null;

  return (
    <section className="featured-track">
      <span className="featured-track__label">Featured Track</span>
      <div className="featured-track__inner">
        <MiniPlayer
          streamingUrl={song.streaming_path}
          trackNumber={song.track_number}
          trackTitle={song.title}
          durationSeconds={song.duration_seconds}
        />
      </div>
    </section>
  );
}
