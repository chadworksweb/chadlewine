"use client";

import { useState } from "react";
import Link from "next/link";
import { RisingCompassScoreBadge } from "./RisingCompassBadge";

interface CuratedEntry {
  id: string;
  type: string;
  title: string;
  slug: string;
  artist_name: string;
  description: string | null;
  cover_image_path: string | null;
  rising_compass_score: number | null;
  rising_compass_classification: string | null;
  genre: string | null;
  mood_tags: string[] | null;
}

export function CurationGrid({ entries }: { entries: CuratedEntry[] }) {
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [genreFilter, setGenreFilter] = useState<string>("all");

  const genres = [...new Set(entries.map(e => e.genre).filter(Boolean))] as string[];
  const types = [...new Set(entries.map(e => e.type))];

  const filtered = entries.filter(e => {
    if (typeFilter !== "all" && e.type !== typeFilter) return false;
    if (genreFilter !== "all" && e.genre !== genreFilter) return false;
    return true;
  });

  return (
    <>
      {(genres.length > 1 || types.length > 1) && (
        <div className="curation-filters">
          {types.length > 1 && (
            <select
              className="curation-filters__select"
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
            >
              <option value="all">All Types</option>
              {types.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}s</option>)}
            </select>
          )}
          {genres.length > 1 && (
            <select
              className="curation-filters__select"
              value={genreFilter}
              onChange={e => setGenreFilter(e.target.value)}
            >
              <option value="all">All Genres</option>
              {genres.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          )}
        </div>
      )}

      <div className="curation-grid">
        {filtered.map(entry => (
          <Link key={entry.id} href={`/curation/${entry.slug}`} className="curation-card">
            {entry.cover_image_path ? (
              <img src={entry.cover_image_path} alt={entry.title} className="curation-card__cover" loading="lazy" />
            ) : (
              <div className="curation-card__cover curation-card__cover--empty" />
            )}
            <div className="curation-card__info">
              <span className="curation-card__type">{entry.type}</span>
              <span className="curation-card__title">{entry.title}</span>
              <span className="curation-card__artist">{entry.artist_name}</span>
              {entry.rising_compass_score != null && (
                <RisingCompassScoreBadge
                  score={entry.rising_compass_score}
                  classification={entry.rising_compass_classification}
                  size="sm"
                />
              )}
            </div>
          </Link>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="empty-state">
          <p className="empty-state__message">No entries match those filters.</p>
        </div>
      )}
    </>
  );
}
