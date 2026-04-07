"use client";

import Link from "next/link";
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

export function FeaturedTrack({ song, album }: FeaturedTrackProps) {
  return (
    <section className="featured-track">
      <span className="featured-track__label">Featured Track</span>
      <div className="featured-track__inner">
        {album.cover_art_path && (
          <Link href={`/music/songs/${song.slug}`} className="featured-track__art-link">
            <img
              src={album.cover_art_path}
              alt={album.cover_art_alt || album.title}
              className="featured-track__art"
              loading="eager"
            />
          </Link>
        )}
        <div className="featured-track__info">
          <Link href={`/music/songs/${song.slug}`} className="featured-track__title">
            {song.title}
          </Link>
          <Link href={`/music/albums/${album.slug}`} className="featured-track__album">
            {album.title}
          </Link>
          {song.streaming_path && song.duration_seconds && (
            <MiniPlayer
              streamingUrl={song.streaming_path}
              trackNumber={song.track_number}
              trackTitle={song.title}
              durationSeconds={song.duration_seconds}
            />
          )}
        </div>
      </div>
    </section>
  );
}
