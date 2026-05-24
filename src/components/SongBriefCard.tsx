"use client";

import Link from "next/link";

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
      {/* Real side walls give the card actual glass thickness in 3D space
          (the article is a preserve-3d, slightly-turned slab). aria-hidden +
          pointer-events:none — purely structural. */}
      <span className="song-brief-card__edge song-brief-card__edge--right" aria-hidden="true" />
      <span className="song-brief-card__edge song-brief-card__edge--bottom" aria-hidden="true" />
      {song.art_image_path && (
        <div
          className="song-brief-card__art-bg"
          style={{ backgroundImage: `url(${song.art_image_path})` }}
          aria-hidden="true"
        />
      )}
      {song.art_image_path && (
        // Reflection on a virtual glossy surface — grounds the slab in space so
        // it reads as a standing object at rest, not a flat parallelogram.
        <div
          className="song-brief-card__reflection"
          style={{ backgroundImage: `url(${song.art_image_path})` }}
          aria-hidden="true"
        />
      )}
      <Link href={href} className="song-brief-card__cover-link" aria-label={song.title} />
      <header className="song-brief-card__header">
        <div className="song-brief-card__heading-text">
          <h3 className="song-brief-card__title">{song.title}</h3>
          {song.album && (
            <span className="song-brief-card__album">{song.album.title}</span>
          )}
        </div>
      </header>

      {song.song_summary && (
        <p className="song-brief-card__summary">{song.song_summary}</p>
      )}

      {song.chad_quote && (
        <blockquote className="song-brief-card__quote">
          <p>{song.chad_quote}</p>
        </blockquote>
      )}

      {song.chorus && (
        <div className="song-brief-card__chorus">{song.chorus}</div>
      )}

      {/* Mobile-only navigation. On desktop the whole card is a hover-link with
          a cursor tooltip; on mobile that whole-card link is disabled (so a tap
          doesn't fire mid-scroll) and only this CTA navigates. */}
      <Link href={href} className="song-brief-card__cta-link" aria-label={`Explore ${song.title}`}>
        Explore song →
      </Link>
    </article>
  );
}
