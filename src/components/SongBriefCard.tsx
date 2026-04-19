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

  return (
    <article className="song-brief-card">
      <header className="song-brief-card__header">
        <div className="song-brief-card__heading-text">
          <Link href={href} className="song-brief-card__title-link">
            <h3 className="song-brief-card__title">{song.title}</h3>
          </Link>
          {song.album && (
            <Link href={`/music/albums/${song.album.slug}`} className="song-brief-card__album">
              {song.album.title}
            </Link>
          )}
        </div>
        {song.art_image_path && (
          <Link href={href} className="song-brief-card__thumb-link" aria-hidden="true" tabIndex={-1}>
            <Image
              src={song.art_image_path}
              alt={song.art_alt || ""}
              className="song-brief-card__thumb"
              width={200}
              height={200}
              sizes="100px"
              loading="lazy"
            />
          </Link>
        )}
      </header>

      {song.song_summary && (
        <p className="song-brief-card__summary">{song.song_summary}</p>
      )}

      {song.chorus && (
        <div className="song-brief-card__chorus">{song.chorus}</div>
      )}

      {song.chad_quote && (
        <blockquote className="song-brief-card__quote">
          <p>{song.chad_quote}</p>
          <cite>— Chad Lewine</cite>
        </blockquote>
      )}

      {song.hooks.length > 0 && (
        <ul className="song-brief-card__hooks">
          {song.hooks.slice(0, 7).map((h, i) => (
            <li key={i} className="song-brief-card__hook">{h}</li>
          ))}
        </ul>
      )}

      <Link href={href} className="song-brief-card__cta">
        Read the full song page →
      </Link>
    </article>
  );
}
