"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlbumCubeRadiant } from "./AlbumCubeRadiant";

// Per-album Plane 3 ("The Visual") video clips. Add entries as videos are created.
const PLANE_THREE_VIDEOS: Record<string, string> = {
  "choose-lit": "/videos/choose-lit_wilson_ct_master.mp4",
};

interface DiscographyItem {
  id: string;
  title: string;
  slug: string;
  type: "album" | "single";
  release_date: string | null;
  cover_art_path: string | null;
  format_label: string | null;
  href: string;
  chorus: string | null;
}

type SortMode = "newest" | "oldest" | "az" | "za";

interface DiscographyExplorerProps {
  items: DiscographyItem[];
  allFormats: string[];
}

function itemDate(item: DiscographyItem): number {
  return item.release_date ? new Date(item.release_date).getTime() : 0;
}

export function DiscographyExplorer({ items, allFormats }: DiscographyExplorerProps) {
  const [selectedFormat, setSelectedFormat] = useState<string>("");
  const [sortMode, setSortMode] = useState<SortMode>("newest");

  function clearFilters() {
    setSelectedFormat("");
  }

  const visible = useMemo(() => {
    let filtered = items;

    if (selectedFormat) {
      filtered = filtered.filter((item) => item.format_label === selectedFormat);
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
  }, [items, selectedFormat, sortMode]);

  return (
    <>
      <div className="songs-explorer__controls">
        <div className="songs-explorer__topics" role="group" aria-label="Filter by format">
          <button
            type="button"
            className={`songs-explorer__topic-chip${!selectedFormat ? " is-selected" : ""}`}
            onClick={clearFilters}
          >
            All
          </button>
          {allFormats.map((f) => (
            <button
              type="button"
              key={f}
              className={`songs-explorer__topic-chip${selectedFormat === f ? " is-selected" : ""}`}
              onClick={() => setSelectedFormat((prev) => (prev === f ? "" : f))}
              aria-pressed={selectedFormat === f}
            >
              {f}
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
                <AlbumCubeRadiant
                  title={item.title}
                  href={item.href}
                  coverArtPath={item.cover_art_path}
                  planeThreeVideo={PLANE_THREE_VIDEOS[item.slug] ?? null}
                  chorus={item.chorus}
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
