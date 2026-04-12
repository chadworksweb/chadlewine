"use client";

import { useState } from "react";
import Link from "next/link";

interface ExploreSong {
  id: string;
  title: string;
  slug: string;
  song_summary: string | null;
  album: {
    title: string;
    slug: string;
    cover_art_path: string | null;
    cover_art_alt: string | null;
  } | null;
}

interface ExploreSongsProps {
  songs: ExploreSong[];
}

export function ExploreSongs({ songs }: ExploreSongsProps) {
  const [active, setActive] = useState(0);
  if (!songs || songs.length === 0) return null;

  const current = songs[active];
  const last = songs.length - 1;

  return (
    <section className="explore-songs">
      <div className="explore-songs__frame explore-songs__frame--top" aria-hidden="true">
        <span className="explore-songs__frame-label">◉ Lens · 002 / Explore Songs</span>
      </div>

      <div className="explore-songs__inner site-contain">
        <h2 className="explore-songs__heading">Explore Songs</h2>

        <div className="coverflow">
          <button
            type="button"
            className="coverflow__nav coverflow__nav--prev"
            onClick={() => setActive((a) => Math.max(0, a - 1))}
            disabled={active === 0}
            aria-label="Previous song"
          >
            ‹
          </button>

          <div className="coverflow__stage">
            {songs.map((s, i) => {
              const offset = i - active;
              const abs = Math.abs(offset);
              const style: React.CSSProperties = {
                transform: `translateX(${offset * 140}px) translateZ(${-abs * 160}px) rotateY(${offset * -32}deg)`,
                zIndex: 100 - abs,
                opacity: abs > 3 ? 0 : 1,
                pointerEvents: abs > 3 ? "none" : "auto",
              };
              return (
                <button
                  type="button"
                  key={s.id}
                  className={`coverflow__card${i === active ? " coverflow__card--active" : ""}`}
                  style={style}
                  onClick={() => setActive(i)}
                  aria-label={s.title}
                >
                  {s.album?.cover_art_path ? (
                    <img
                      src={s.album.cover_art_path}
                      alt={s.album.cover_art_alt || s.title}
                      className="coverflow__art"
                      loading="lazy"
                    />
                  ) : (
                    <div className="coverflow__art coverflow__art--empty" />
                  )}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            className="coverflow__nav coverflow__nav--next"
            onClick={() => setActive((a) => Math.min(last, a + 1))}
            disabled={active === last}
            aria-label="Next song"
          >
            ›
          </button>
        </div>

        <div className="explore-songs__meta">
          <h3 className="explore-songs__title">{current.title}</h3>
          {current.album && (
            <Link
              href={`/music/albums/${current.album.slug}`}
              className="explore-songs__album"
            >
              from <em>{current.album.title}</em>
            </Link>
          )}
          {current.song_summary && (
            <p className="explore-songs__summary">{current.song_summary}</p>
          )}
          <Link
            href={`/music/songs/${current.slug}`}
            className="explore-songs__cta"
          >
            Listen →
          </Link>
        </div>
      </div>

      <div className="explore-songs__frame explore-songs__frame--bottom" aria-hidden="true">
        <span className="explore-songs__frame-label">◯ End · Lens / 002</span>
      </div>
    </section>
  );
}
