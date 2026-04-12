"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

interface Topic {
  id: string;
  label: string;
  slug: string;
}

interface SongCardData {
  id: string;
  title: string;
  slug: string;
  status: string;
  is_single: boolean;
  release_date: string | null;
  created_at: string;
  art_image_path: string | null;
  art_alt: string | null;
  song_summary: string | null;
  citation_summary: string | null;
  focus_keyphrase: string | null;
  secondary_keyphrases: string[];
  paa_pairs: { question: string; answer: string }[];
  entity_tags: string[];
  album: {
    title: string;
    slug: string;
    status: string;
    cover_art_path: string | null;
    cover_art_alt: string | null;
  } | null;
  topics: Topic[];
}

type SortMode = "newest" | "oldest" | "az" | "za";

interface SongsExplorerProps {
  songs: SongCardData[];
  allTopics: Topic[];
}

function songDate(s: SongCardData): number {
  const d = s.release_date || s.created_at;
  return d ? new Date(d).getTime() : 0;
}

function resolveArt(s: SongCardData): { src: string | null; alt: string } {
  const src = s.art_image_path || s.album?.cover_art_path || null;
  const alt = s.art_alt || s.album?.cover_art_alt || s.title;
  return { src, alt };
}

/**
 * Click-through rules:
 *  - published songs always navigate to their detail page
 *  - unreleased songs navigate only if they're singles (they have their own release surface)
 *  - unreleased album tracks do NOT navigate (listed only)
 *  - draft songs never appear here
 */
function canClickThrough(s: SongCardData): boolean {
  if (s.status === "published") return true;
  if (s.status === "unreleased" && s.is_single) return true;
  return false;
}

function firstTwoSentences(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const matches = trimmed.match(/[^.!?]+[.!?]+(?=\s|$)/g);
  if (!matches || matches.length === 0) return trimmed;
  return matches.slice(0, 2).join(" ").replace(/\s+/g, " ").trim();
}

function halfArray<T>(arr: T[]): T[] {
  if (arr.length <= 1) return arr;
  return arr.slice(0, Math.ceil(arr.length / 2));
}

export function SongsExplorer({ songs, allTopics }: SongsExplorerProps) {
  const [selectedTopicIds, setSelectedTopicIds] = useState<Set<string>>(new Set());
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function toggleTopic(id: string) {
    setSelectedTopicIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearFilters() {
    setSelectedTopicIds(new Set());
  }

  function toggleRow(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  const visible = useMemo(() => {
    const selected = [...selectedTopicIds];
    const filtered =
      selected.length === 0
        ? songs
        : songs.filter((s) =>
            selected.every((id) => s.topics.some((t) => t.id === id))
          );

    const sorted = [...filtered];
    switch (sortMode) {
      case "newest":
        sorted.sort((a, b) => songDate(b) - songDate(a));
        break;
      case "oldest":
        sorted.sort((a, b) => songDate(a) - songDate(b));
        break;
      case "az":
        sorted.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case "za":
        sorted.sort((a, b) => b.title.localeCompare(a.title));
        break;
    }
    return sorted;
  }, [songs, selectedTopicIds, sortMode]);

  return (
    <>
      <div className="songs-explorer__controls">
        <div className="songs-explorer__topics" role="group" aria-label="Filter by topic">
          <button
            type="button"
            className={`songs-explorer__topic-chip${selectedTopicIds.size === 0 ? " is-selected" : ""}`}
            onClick={clearFilters}
          >
            All
          </button>
          {allTopics.map((t) => {
            const isSel = selectedTopicIds.has(t.id);
            return (
              <button
                type="button"
                key={t.id}
                className={`songs-explorer__topic-chip${isSel ? " is-selected" : ""}`}
                onClick={() => toggleTopic(t.id)}
                aria-pressed={isSel}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="songs-explorer__sort">
          <label htmlFor="songs-sort" className="songs-explorer__sort-label">Sort</label>
          <select
            id="songs-sort"
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
        Showing {visible.length} of {songs.length} songs
      </div>

      {visible.length === 0 ? (
        <p className="songs-explorer__empty">No songs match these filters.</p>
      ) : (
        <table className="songs-explorer__table">
          <colgroup>
            <col className="col--art" />
            <col className="col--title" />
            <col className="col--release" />
            <col className="col--topics" />
            <col className="col--action" />
          </colgroup>
          <thead>
            <tr>
              <th className="songs-explorer__th songs-explorer__th--art" aria-label="Art" />
              <th className="songs-explorer__th">Title</th>
              <th className="songs-explorer__th">Release</th>
              <th className="songs-explorer__th">Topics</th>
              <th className="songs-explorer__th songs-explorer__th--action" aria-label="Action" />
            </tr>
          </thead>
          <tbody>
            {visible.map((s) => {
              const { src, alt } = resolveArt(s);
              const href = `/music/songs/${s.slug}`;
              const isOpen = expandedId === s.id;
              return (
                <SongRow
                  key={s.id}
                  song={s}
                  href={href}
                  artSrc={src}
                  artAlt={alt}
                  isOpen={isOpen}
                  navigable={canClickThrough(s)}
                  onToggle={() => toggleRow(s.id)}
                />
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}

function SongRow({
  song,
  href,
  artSrc,
  artAlt,
  isOpen,
  navigable,
  onToggle,
}: {
  song: SongCardData;
  href: string;
  artSrc: string | null;
  artAlt: string;
  isOpen: boolean;
  navigable: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        className={`songs-explorer__row${isOpen ? " is-open" : ""}`}
        onClick={onToggle}
        role="button"
        aria-expanded={isOpen}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
      >
        <td className="songs-explorer__td songs-explorer__td--art">
          {artSrc ? (
            <img
              src={artSrc}
              alt={artAlt}
              className="songs-explorer__row-art"
              loading="lazy"
            />
          ) : (
            <div className="songs-explorer__row-art songs-explorer__row-art--empty" />
          )}
        </td>
        <td className="songs-explorer__td songs-explorer__td--title">
          <span className="songs-explorer__row-title">{song.title}</span>
          <span className="songs-explorer__row-caret" aria-hidden="true">
            {isOpen ? "−" : "+"}
          </span>
        </td>
        <td className="songs-explorer__td songs-explorer__td--release">
          {song.album ? (
            <>
              {song.album.title}
              {song.album.status !== "published" && (
                <span className="songs-explorer__row-forthcoming"> · Forthcoming</span>
              )}
              {song.is_single && (
                <span className="songs-explorer__row-single-badge"> · Single</span>
              )}
            </>
          ) : song.is_single ? (
            <em>Single</em>
          ) : (
            <span className="songs-explorer__row-muted">—</span>
          )}
        </td>
        <td className="songs-explorer__td">
          {song.topics.length > 0 ? (
            <div className="songs-explorer__row-topics">
              {song.topics.map((t) => (
                <span key={t.id} className="songs-explorer__card-topic">
                  {t.label}
                </span>
              ))}
            </div>
          ) : (
            <span className="songs-explorer__row-muted">—</span>
          )}
        </td>
        <td className="songs-explorer__td songs-explorer__td--action">
          {navigable ? (
            <Link
              href={href}
              className="songs-explorer__row-btn"
              onClick={(e) => e.stopPropagation()}
            >
              View Song →
            </Link>
          ) : (
            <span className="songs-explorer__row-muted">—</span>
          )}
        </td>
      </tr>

      {isOpen && (() => {
        const trimmedSecondary = song.secondary_keyphrases.filter((k) => k.trim());
        const trimmedEntities = song.entity_tags.filter((e) => e.trim());
        const halfPaa = halfArray(song.paa_pairs);
        const halfSecondary = halfArray(trimmedSecondary);
        const halfEntities = halfArray(trimmedEntities);

        return (
          <tr className="songs-explorer__drawer-row">
            <td colSpan={5} className="songs-explorer__drawer-cell">
              <div className="songs-explorer__drawer">
                <div className="songs-explorer__drawer-art-col">
                  {artSrc ? (
                    <img
                      src={artSrc}
                      alt={artAlt}
                      className="songs-explorer__drawer-art"
                      loading="lazy"
                    />
                  ) : (
                    <div className="songs-explorer__drawer-art songs-explorer__drawer-art--empty" />
                  )}
                </div>

                <div className="songs-explorer__drawer-main">
                  {song.song_summary && (
                    <section className="songs-explorer__drawer-section">
                      <h3 className="songs-explorer__drawer-label">Summary</h3>
                      <p className="songs-explorer__drawer-prose">{firstTwoSentences(song.song_summary)}</p>
                    </section>
                  )}

                  {song.citation_summary && (
                    <section className="songs-explorer__drawer-section">
                      <h3 className="songs-explorer__drawer-label">Citation</h3>
                      <p className="songs-explorer__drawer-quote">{firstTwoSentences(song.citation_summary)}</p>
                    </section>
                  )}

                  {halfPaa.length > 0 && (
                    <section className="songs-explorer__drawer-section">
                      <h3 className="songs-explorer__drawer-label">People Also Ask</h3>
                      <dl className="songs-explorer__drawer-paa">
                        {halfPaa.map((p, i) => (
                          <div key={i} className="songs-explorer__drawer-paa-item">
                            <dt>{p.question}</dt>
                            <dd>{firstTwoSentences(p.answer)}</dd>
                          </div>
                        ))}
                      </dl>
                    </section>
                  )}
                </div>

                <aside className="songs-explorer__drawer-side">
                  {song.focus_keyphrase && (
                    <div className="songs-explorer__drawer-meta">
                      <span className="songs-explorer__drawer-meta-label">Focus</span>
                      <span className="songs-explorer__drawer-meta-value">{song.focus_keyphrase}</span>
                    </div>
                  )}

                  {halfSecondary.length > 0 && (
                    <div className="songs-explorer__drawer-meta">
                      <span className="songs-explorer__drawer-meta-label">Related</span>
                      <div className="songs-explorer__drawer-chips">
                        {halfSecondary.map((k, i) => (
                          <span key={i} className="songs-explorer__drawer-chip">
                            {k}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {halfEntities.length > 0 && (
                    <div className="songs-explorer__drawer-meta">
                      <span className="songs-explorer__drawer-meta-label">Entities</span>
                      <div className="songs-explorer__drawer-chips">
                        {halfEntities.map((e, i) => (
                          <span key={i} className="songs-explorer__drawer-chip">
                            {e}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {navigable ? (
                    <Link
                      href={href}
                      className="songs-explorer__drawer-cta"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Read The Full Story →
                    </Link>
                  ) : (
                    <span className="songs-explorer__drawer-cta songs-explorer__drawer-cta--disabled">
                      Full Story Coming Soon
                    </span>
                  )}
                </aside>
              </div>
            </td>
          </tr>
        );
      })()}
    </>
  );
}
