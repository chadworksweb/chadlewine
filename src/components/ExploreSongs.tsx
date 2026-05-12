"use client";

import { useState } from "react";
import Link from "next/link";

interface ExploreSong {
  id: string;
  title: string;
  slug: string;
  song_summary: string | null;
  art_image_path: string | null;
  art_alt: string | null;
  album: {
    title: string;
    slug: string;
    cover_art_path: string | null;
    cover_art_alt: string | null;
  } | null;
}

function resolveArt(s: ExploreSong): { src: string | null; alt: string } {
  const src = s.art_image_path || s.album?.cover_art_path || null;
  const alt = s.art_alt || s.album?.cover_art_alt || s.title;
  return { src, alt };
}

interface ExploreSongsProps {
  songs: ExploreSong[];
}

export function ExploreSongs({ songs }: ExploreSongsProps) {
  const [active, setActive] = useState(Math.floor(songs.length / 2));
  if (!songs || songs.length === 0) return null;

  const current = songs[active];
  const last = songs.length - 1;

  return (
    <section className="explore-songs">
      <div className="glyph-title-bar glyph-title-bar--top">
        <span className="glyph-title-bar__label" aria-hidden="true">░▒▓█</span>
        <h2 className="glyph-title-bar__heading">Browse Chad Lewine Songs</h2>
        <span className="glyph-title-bar__label" aria-hidden="true">█▓▒░</span>
      </div>

      <div className="explore-songs__inner site-contain">

        <div className="coverflow">
          <button
            type="button"
            className="coverflow__nav coverflow__nav--prev"
            onClick={() => setActive((a) => Math.max(0, a - 1))}
            disabled={active === 0}
            aria-label="Previous song"
          >
            <span className="coverflow__nav-glyph">❮</span>
          </button>

          <div className="coverflow__stage">
            {songs.map((s, i) => {
              const offset = i - active;
              const abs = Math.abs(offset);
              const style: React.CSSProperties = {
                transform: `translateX(${offset * 148}px) translateZ(${-abs * 160}px) rotateY(${offset * -19}deg)`,
                zIndex: 100 - abs,
                opacity: abs > 5 ? 0 : 1,
                pointerEvents: abs > 5 ? "none" : "auto",
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
                  {(() => {
                    const { src, alt } = resolveArt(s);
                    return src ? (
                      <img
                        src={src}
                        alt={alt}
                        className="coverflow__art"
                        loading="lazy"
                      />
                    ) : (
                      <div className="coverflow__art coverflow__art--empty" />
                    );
                  })()}
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
            <span className="coverflow__nav-glyph">❯</span>
          </button>
        </div>

        <div className="explore-songs__meta">
          <h3 className="explore-songs__title">{current.title}</h3>
          <span className="explore-songs__album">
            from{" "}
            {current.album ? (
              <Link
                href={`/music/albums/${current.album.slug}`}
                className="explore-songs__album-link"
              >
                <em>{current.album.title}</em>
              </Link>
            ) : (
              <em>{current.title}</em>
            )}
          </span>
          <div className="explore-songs__detail-row">
            <p className="explore-songs__summary">
              {current.song_summary || "A short summary of this song will appear here — capturing the essence of the track in a sentence or two."}
            </p>
            <Link
              href={`/music/songs/${current.slug}`}
              className="explore-songs__cta"
            >
              Listen →
            </Link>
          </div>
        </div>
      </div>

      <Link href="/music/songs" className="home-merch__view-all">
        View All Songs →
      </Link>
    </section>
  );
}
