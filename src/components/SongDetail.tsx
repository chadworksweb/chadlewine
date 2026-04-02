"use client";

import { useState } from "react";
import Link from "next/link";
import { MiniPlayer } from "@/components/MiniPlayer";

interface SongProps {
  id: string;
  title: string;
  slug: string;
  track_number: number;
  duration_seconds: number | null;
  streaming_path: string | null;
  lyrics: string | null;
  price: number | null;
  release_date: string | null;
  song_summary: string | null;
  isrc: string | null;
}

interface AlbumProps {
  id: string;
  title: string;
  slug: string;
  cover_art_path: string | null;
  cover_art_alt: string | null;
  price: number | null;
}

interface ExpansionProps {
  id: string;
  title: string;
  slug: string;
  body: string;
}

function formatPrice(dollars: number): string {
  return `$${Number(dollars).toFixed(2)}`;
}

export function SongDetail({
  song,
  album,
  totalTracks,
  expansions = [],
}: {
  song: SongProps;
  album: AlbumProps;
  totalTracks: number;
  expansions?: ExpansionProps[];
}) {
  const [lyricsExpanded, setLyricsExpanded] = useState(false);
  const [buying, setBuying] = useState<"song" | "album" | null>(null);
  const [openExpansions, setOpenExpansions] = useState<Set<string>>(new Set());

  function toggleExpansion(id: string) {
    setOpenExpansions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleBuy(type: "song" | "album") {
    setBuying(type);
    try {
      const res = await fetch("/api/music-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, id: type === "song" ? song.id : album.id }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } finally {
      setBuying(null);
    }
  }

  const infoCells: { label: string; value: React.ReactNode }[] = [];

  if (song.price) {
    infoCells.push({ label: "Price", value: formatPrice(song.price) });
  }

  infoCells.push({
    label: "Track",
    value: `${song.track_number} of ${totalTracks}`,
  });

  infoCells.push({
    label: "Album",
    value: (
      <Link
        href="/discography"
        className="track-detail__glitch-link"
        data-text={album.title}
      >
        {album.title}
      </Link>
    ),
  });

  return (
    <div className="track-detail">
      <div className="track-detail__grid">
        {/* Left column — Album art */}
        <div className="track-detail__art-col">
          {album.cover_art_path && (
            <img
              src={album.cover_art_path}
              alt={album.cover_art_alt || album.title}
              className="track-detail__cover"
              loading="eager"
            />
          )}
        </div>

        {/* Right column — Content */}
        <div className="track-detail__content-col">
          <h1 className="track-detail__title">{song.title}</h1>

          {/* Info bar */}
          <div
            className="track-detail__info-bar"
            data-cols={infoCells.length}
          >
            {infoCells.map((cell, i) => (
              <div key={i} className="track-detail__info-cell">
                <span className="track-detail__info-label">{cell.label}</span>
                <span className="track-detail__info-value">{cell.value}</span>
              </div>
            ))}
          </div>

          {/* Mini player */}
          {song.streaming_path && song.duration_seconds && (
            <MiniPlayer
              streamingUrl={song.streaming_path}
              trackNumber={song.track_number}
              trackTitle={song.title}
              durationSeconds={song.duration_seconds}
            />
          )}

          {/* Action buttons */}
          <div className="track-detail__actions">
            <Link href={`/music/albums/${album.slug}`} className="track-detail__btn track-detail__btn--buy-album">
              Buy Album{album.price ? ` — ${formatPrice(album.price)}` : ""}
            </Link>
            {song.price && (
              <button
                type="button"
                className="track-detail__btn track-detail__btn--buy"
                onClick={() => handleBuy("song")}
                disabled={buying === "song"}
              >
                {buying === "song" ? "..." : `Buy Song — ${formatPrice(song.price)}`}
              </button>
            )}
          </div>

          {/* Lyrics */}
          {song.lyrics && (
            <div className="track-detail__section">
              <h3 className="track-detail__section-title">Lyrics</h3>
              <div
                className={`track-detail__lyrics ${lyricsExpanded ? "track-detail__lyrics--expanded" : ""}`}
              >
                <pre className="track-detail__lyrics-text">{song.lyrics.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\\r/g, "\n")}</pre>
              </div>
              <button
                type="button"
                className="track-detail__lyrics-toggle"
                onClick={() => setLyricsExpanded((v) => !v)}
              >
                {lyricsExpanded ? "Show less" : "Show full lyrics"}
              </button>
            </div>
          )}

          {/* Song Summary */}
          {song.song_summary && (
            <div className="track-detail__section">
              <h3 className="track-detail__section-title">About This Song</h3>
              <div className="track-detail__summary-text">
                {song.song_summary}
              </div>
            </div>
          )}

          {/* Expansions */}
          {expansions.length > 0 && (
            <div className="track-detail__section">
              <h3 className="track-detail__section-title">Deep Dive</h3>
              <div className="track-detail__expansions">
                {expansions.map((exp) => (
                  <div key={exp.id} className="track-detail__expansion">
                    <button
                      type="button"
                      className="track-detail__expansion-toggle"
                      onClick={() => toggleExpansion(exp.id)}
                      aria-expanded={openExpansions.has(exp.id)}
                    >
                      <span className="track-detail__expansion-arrow">
                        {openExpansions.has(exp.id) ? "▾" : "▸"}
                      </span>
                      {exp.title}
                    </button>
                    {openExpansions.has(exp.id) && (
                      <div className="track-detail__expansion-body">
                        {exp.body.split("\n\n").map((paragraph, i) => (
                          <p key={i}>{paragraph}</p>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
