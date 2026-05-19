"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { DiscographyCubeRadiant, type DiscographyCubeFace } from "./DiscographyCubeRadiant";
import { releaseTypeLabel } from "@/lib/release-labels";

type ReleaseType = "album" | "ep" | "single" | "compilation";

interface DiscographyItem {
  id: string;
  title: string;
  slug: string;
  type: "album" | "single";
  release_type: ReleaseType;
  release_date: string | null;
  cover_art_path: string | null;
  format_label: string | null;
  href: string;
  chorus: string | null;
  tracklist: string[] | null;
  concept_statement: string | null;
  card_focal_x: number | null;
  card_focal_y: number | null;
  card_zoom: number | null;
  faces: DiscographyCubeFace[];
}

type SortMode = "newest" | "oldest" | "az" | "za";

interface DiscographyExplorerProps {
  items: DiscographyItem[];
  allTypes: ReleaseType[];
}

function itemDate(item: DiscographyItem): number {
  return item.release_date ? new Date(item.release_date).getTime() : 0;
}

export function DiscographyExplorer({ items, allTypes }: DiscographyExplorerProps) {
  const [selectedType, setSelectedType] = useState<ReleaseType | "">("");
  const [sortMode, setSortMode] = useState<SortMode>("newest");

  function clearFilters() {
    setSelectedType("");
  }

  const visible = useMemo(() => {
    let filtered = items;

    if (selectedType) {
      filtered = filtered.filter((item) => item.release_type === selectedType);
    }

    const sorted = [...filtered];
    switch (sortMode) {
      case "newest":
        sorted.sort((a, b) => itemDate(b) - itemDate(a));
        break;
      case "oldest":
        sorted.sort((a, b) => itemDate(a) - itemDate(b));
        break;
      case "az":
        sorted.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case "za":
        sorted.sort((a, b) => b.title.localeCompare(a.title));
        break;
    }
    return sorted;
  }, [items, selectedType, sortMode]);

  return (
    <>
      <div className="songs-explorer__controls">
        <div className="songs-explorer__topics" role="group" aria-label="Filter by release type">
          <button
            type="button"
            className={`songs-explorer__topic-chip${!selectedType ? " is-selected" : ""}`}
            onClick={clearFilters}
          >
            All
          </button>
          {allTypes.map((t) => (
            <button
              type="button"
              key={t}
              className={`songs-explorer__topic-chip${selectedType === t ? " is-selected" : ""}`}
              onClick={() => setSelectedType((prev) => (prev === t ? "" : t))}
              aria-pressed={selectedType === t}
            >
              {releaseTypeLabel(t)}
            </button>
          ))}
        </div>

        <div className="songs-explorer__sort">
          <label htmlFor="disco-sort" className="songs-explorer__sort-label">Sort</label>
          <select
            id="disco-sort"
            className="songs-explorer__sort-select"
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="az">A–Z</option>
            <option value="za">Z–A</option>
          </select>
        </div>
      </div>

      <div className="songs-explorer__count">
        Showing {visible.length} of {items.length} releases
      </div>

      {visible.length === 0 ? (
        <p className="songs-explorer__empty">No releases match these filters.</p>
      ) : (
        <div className="discography-grid">
          {visible.map((item) => {
            const year = item.release_date
              ? new Date(item.release_date).getFullYear()
              : null;

            return (
              <div key={item.id} className="discography-grid__card">
                <DiscographyCubeRadiant
                  title={item.title}
                  href={item.href}
                  coverArtPath={item.cover_art_path}
                  cardFocalX={item.card_focal_x}
                  cardFocalY={item.card_focal_y}
                  cardZoom={item.card_zoom}
                  faces={item.faces}
                />
                <div className="discography-grid__info">
                  <span className="discography-grid__meta">
                    <Link href={item.href} className="discography-grid__title">
                      {item.title}
                    </Link>
                    {year && <span className="discography-grid__year">({year})</span>}
                    {item.format_label && (
                      <span className="discography-grid__format">{item.format_label}</span>
                    )}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
