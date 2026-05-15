"use client";

import Link from "next/link";
import Image from "next/image";

export interface SongBriefData {
  id: string;
  slug: string;
  title: string;
  song_summary: string | null;
  chorus: string | null;
  chad_quote: string | null;
  art_image_path: string | null;
  art_alt: string | null;
  album: { title: string; slug: string } | null;
  hooks: string[];
}

export function SongBriefCard({ song }: { song: SongBriefData }) {
  const href = `/music/songs/${song.slug}`;

  const handleMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--tooltip-x", `${e.clientX - rect.left}px`);
    e.currentTarget.style.setProperty("--tooltip-y", `${e.clientY - rect.top}px`);
  };

  return (
    <article className="song-brief-card" onMouseMove={handleMouseMove}>
      <Link href={href} className="song-brief-card__cover-link" aria-label={song.title} />
      <header className="song-brief-card__header">
        <div className="song-brief-card__heading-text">
          <h3 className="song-brief-card__title">{song.title}</h3>
          {song.album && (
            <Link href={`/music/albums/${song.album.slug}`} className="song-brief-card__album">
              {song.album.title}
            </Link>
          )}
        </div>
        {song.art_image_path && (
          <Image
            src={song.art_image_path}
            alt={song.art_alt || ""}
            className="song-brief-card__thumb"
            width={200}
            height={200}
            sizes="100px"
            loading="lazy"
          />
        )}
      </header>

      {song.chad_quote && (
        <blockquote className="song-brief-card__quote">
          <p>{song.chad_quote}</p>
          <cite>— Chad Lewine</cite>
        </blockquote>
      )}

      {song.song_summary && (
        <p className="song-brief-card__summary">{song.song_summary}</p>
      )}

      {song.chorus && (
        <div className="song-brief-card__chorus">{song.chorus}</div>
      )}
    </article>
  );
}
