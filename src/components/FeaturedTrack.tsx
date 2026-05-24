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
  playbackMode?: "preview" | "full";
}

export function FeaturedTrack({ song, album, playbackMode = "preview" }: FeaturedTrackProps) {
  if (!song.streaming_path || !song.duration_seconds) return null;

  const shared = {
    songId: song.id,
    songSlug: song.slug,
    streamingUrl: song.streaming_path,
    trackNumber: song.track_number,
    trackTitle: song.title,
    durationSeconds: song.duration_seconds,
    artImagePath: album.cover_art_path,
    artAlt: album.cover_art_alt || album.title,
    playbackMode,
  };

  return (
    <>
      {/* Mobile: album art with the play button + progress ring overlaid, and
          an explore CTA beneath. Hidden on desktop via CSS. */}
      <div className="featured-track__mobile">
        <MiniPlayer {...shared} variant="art" />
        <Link href={`/music/songs/${song.slug}`} className="featured-track__cta">
          explore song
        </Link>
      </div>

      {/* Desktop: the standard waveform mini-player row. Hidden on mobile. */}
      <div className="featured-track__bar">
        <MiniPlayer {...shared} />
      </div>
    </>
  );
}
