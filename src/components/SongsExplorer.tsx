"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { focalCropStyle } from "@/lib/focal-crop";

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
  effective_release_date: string | null;
  track_no: number | null;
  created_at: string;
  art_image_path: string | null;
  art_alt: string | null;
  card_focal_x: number | null;
  card_focal_y: number | null;
  card_zoom: number | null;
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

// A song's effective date: its own release_date (singles), else its associated
// release's date (album/EP/comp tracks). Null = "forthcoming" (no date yet) —
// these are deliberately floated to the top of the newest view, not buried.
function songDate(s: SongCardData): number | null {
  const d = s.release_date || s.effective_release_date;
  return d ? new Date(d).getTime() : null;
}

// Tiebreak for songs sharing a date (and for the whole undated/forthcoming
// group): tracklisting order first, then alphabetical for anything with no
// track number.
function byTrackThenTitle(a: SongCardData, b: SongCardData): number {
  if (a.track_no != null && b.track_no != null) {
    if (a.track_no !== b.track_no) return a.track_no - b.track_no;
  } else if (a.track_no != null) {
    return -1; // tracked songs before untracked
  } else if (b.track_no != null) {
    return 1;
  }
  return a.title.localeCompare(b.title);
}

// Focal data is calibrated against the song's own art. When art falls back
// to the album cover, the song's focal coords don't apply — return null
// so the consumer can skip applying them.
function resolveArt(s: SongCardData): {
  src: string | null;
  alt: string;
  ownArt: boolean;
} {
  if (s.art_image_path) {
    return { src: s.art_image_path, alt: s.art_alt || s.title, ownArt: true };
  }
  if (s.album?.cover_art_path) {
    return {
      src: s.album.cover_art_path,
      alt: s.album.cover_art_alt || s.title,
      ownArt: false,
    };
  }
  return { src: null, alt: s.title, ownArt: false };
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
  // Single-select: songs rarely cross multiple topics, so one active topic at a
  // time. null = "All" (no filter).
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  // Which row (if any) should skip its close animation because it's being
  // swapped out for another — a delayed unmount would jump the layout.
  const switchClosingIdRef = useRef<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Mobile-only: the inline topic cloud is too tall on phones, so it collapses
  // behind a "Filter by topic" trigger that opens this bottom sheet.
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  // Lock background scroll while the filter sheet is open.
  useEffect(() => {
    if (!filterSheetOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [filterSheetOpen]);

  // Close the sheet on Escape.
  useEffect(() => {
    if (!filterSheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFilterSheetOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filterSheetOpen]);

  // Click an active topic to clear it; otherwise make it the sole filter.
  function selectTopic(id: string) {
    setSelectedTopicId((prev) => (prev === id ? null : id));
  }

  function clearFilters() {
    setSelectedTopicId(null);
  }

  function toggleRow(id: string) {
    const isClosing = expandedId === id;
    const hadOther = expandedId !== null && expandedId !== id;
    // When swapping songs, the outgoing drawer closes instantly (no delayed
    // unmount) so the layout settles in one step instead of jumping.
    switchClosingIdRef.current = hadOther ? expandedId : null;
    setExpandedId(isClosing ? null : id);

    // Mobile: snap the opened row to just under the fixed nav so the drawer
    // reveals into view. Wait a couple frames for the outgoing drawer to
    // unmount and the layout to settle before measuring.
    if (isClosing) return;
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(max-width: 640px)").matches) return;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const row = document.querySelector<HTMLElement>(".songs-explorer__row.is-open");
        if (!row) return;
        const navOffset = 88; // --nav-height (80px) + small gap
        const top = row.getBoundingClientRect().top + window.scrollY - navOffset;
        window.scrollTo({ top, behavior: "smooth" });
      })
    );
  }

  const visible = useMemo(() => {
    const filtered = selectedTopicId
      ? songs.filter((s) => s.topics.some((t) => t.id === selectedTopicId))
      : songs;

    const sorted = [...filtered];
    switch (sortMode) {
      case "newest":
        // Forthcoming (undated) on top, then dated newest-first; ties (and the
        // forthcoming group) ordered by tracklisting, then alpha.
        sorted.sort((a, b) => {
          const da = songDate(a);
          const db = songDate(b);
          if (da == null && db == null) return byTrackThenTitle(a, b);
          if (da == null) return -1;
          if (db == null) return 1;
          if (da !== db) return db - da;
          return byTrackThenTitle(a, b);
        });
        break;
      case "oldest":
        // Dated oldest-first; undated/forthcoming sink to the bottom. Same
        // tracklisting-then-alpha tiebreak.
        sorted.sort((a, b) => {
          const da = songDate(a);
          const db = songDate(b);
          if (da == null && db == null) return byTrackThenTitle(a, b);
          if (da == null) return 1;
          if (db == null) return -1;
          if (da !== db) return da - db;
          return byTrackThenTitle(a, b);
        });
        break;
      case "az":
        sorted.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case "za":
        sorted.sort((a, b) => b.title.localeCompare(a.title));
        break;
    }
    return sorted;
  }, [songs, selectedTopicId, sortMode]);

  const selectedTopic = selectedTopicId
    ? allTopics.find((t) => t.id === selectedTopicId) ?? null
    : null;

  // Desktop inline cloud (single-select).
  const topicChips = (
    <>
      <button
        type="button"
        className={`songs-explorer__topic-chip${!selectedTopicId ? " is-selected" : ""}`}
        onClick={clearFilters}
      >
        All
      </button>
      {allTopics.map((t) => {
        const isSel = selectedTopicId === t.id;
        return (
          <button
            type="button"
            key={t.id}
            className={`songs-explorer__topic-chip${isSel ? " is-selected" : ""}`}
            onClick={() => selectTopic(t.id)}
            aria-pressed={isSel}
          >
            {t.label}
          </button>
        );
      })}
    </>
  );

  // Phone drum spinner: "All" + every topic, single-select by centered row.
  const wheelItems = useMemo(
    () => [
      { id: null as string | null, label: "All" },
      ...allTopics.map((t) => ({ id: t.id as string | null, label: t.label })),
    ],
    [allTopics]
  );

  const wheelIndex = useMemo(() => {
    if (!selectedTopicId) return 0;
    const i = wheelItems.findIndex((it) => it.id === selectedTopicId);
    return i < 0 ? 0 : i;
  }, [wheelItems, selectedTopicId]);

  const onWheelSelect = useCallback(
    (i: number) => setSelectedTopicId(wheelItems[i]?.id ?? null),
    [wheelItems]
  );

  return (
    <>
      <div className="songs-explorer__controls">
        {/* Desktop: inline topic cloud. Hidden on phones (see global.css). */}
        <div className="songs-explorer__topics" role="group" aria-label="Filter by topic">
          {topicChips}
        </div>

        {/* Phone: trigger that opens the topic filter sheet. */}
        <button
          type="button"
          className={`songs-explorer__filter-trigger${selectedTopic ? " is-active" : ""}`}
          onClick={() => setFilterSheetOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={filterSheetOpen}
        >
          <span className="songs-explorer__filter-trigger-label">
            {selectedTopic ? selectedTopic.label : "Filter by topic"}
          </span>
        </button>

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

      {/* Phone topic filter sheet. Filtering is live, so the footer button
          just dismisses; selections already applied to the list behind it. */}
      {filterSheetOpen && (
        <div
          className="songs-explorer__sheet-overlay"
          onClick={() => setFilterSheetOpen(false)}
        >
          <div
            className="songs-explorer__sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Filter by topic"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="songs-explorer__sheet-header">
              <span className="songs-explorer__sheet-title">Filter by topic</span>
              <button
                type="button"
                className="songs-explorer__sheet-close"
                onClick={() => setFilterSheetOpen(false)}
                aria-label="Close filters"
              >
                &times;
              </button>
            </div>
            <TopicWheel
              items={wheelItems}
              selectedIndex={wheelIndex}
              onSelect={onWheelSelect}
            />
            <div className="songs-explorer__sheet-footer">
              <button
                type="button"
                className="songs-explorer__sheet-clear"
                onClick={clearFilters}
                disabled={!selectedTopicId}
              >
                Clear
              </button>
              <button
                type="button"
                className="songs-explorer__sheet-apply"
                onClick={() => setFilterSheetOpen(false)}
              >
                Show {visible.length} {visible.length === 1 ? "song" : "songs"}
              </button>
            </div>
          </div>
        </div>
      )}

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
              const { src, alt, ownArt } = resolveArt(s);
              const href = `/music/songs/${s.slug}`;
              const isOpen = expandedId === s.id;
              return (
                <SongRow
                  key={s.id}
                  song={s}
                  href={href}
                  artSrc={src}
                  artAlt={alt}
                  artOwn={ownArt}
                  isOpen={isOpen}
                  instantClose={switchClosingIdRef.current === s.id}
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

// iOS-style drum spinner ported from Lyric Transformer's Sound Lock wheel:
// a scroll-snap viewport with spacer rows so the centered item is the
// selection. onScroll rounds scrollTop/itemHeight to the active index.
function TopicWheel({
  items,
  selectedIndex,
  onSelect,
}: {
  items: { id: string | null; label: string }[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const itemHeight = 40;
  const visibleItems = 5;
  // Skip the smooth-scroll effect when the index change came from the user
  // scrolling (otherwise we fight their gesture).
  const suppressScrollRef = useRef(false);

  useEffect(() => {
    if (!listRef.current || suppressScrollRef.current) {
      suppressScrollRef.current = false;
      return;
    }
    listRef.current.scrollTo({ top: selectedIndex * itemHeight, behavior: "smooth" });
  }, [selectedIndex]);

  const handleScroll = useCallback(() => {
    if (!listRef.current) return;
    const idx = Math.round(listRef.current.scrollTop / itemHeight);
    const clamped = Math.max(0, Math.min(items.length - 1, idx));
    if (clamped !== selectedIndex) {
      suppressScrollRef.current = true;
      onSelect(clamped);
    }
  }, [items.length, selectedIndex, onSelect]);

  return (
    <div className="songs-explorer__wheel">
      <div
        className="songs-explorer__wheel-viewport"
        ref={listRef}
        onScroll={handleScroll}
        style={{ height: visibleItems * itemHeight }}
        role="listbox"
        aria-label="Topic"
      >
        <div style={{ height: itemHeight * 2 }} aria-hidden="true" />
        {items.map((it, i) => (
          <button
            type="button"
            key={it.id ?? "__all"}
            role="option"
            aria-selected={i === selectedIndex}
            className={`songs-explorer__wheel-item${i === selectedIndex ? " is-active" : ""}`}
            style={{ height: itemHeight }}
            onClick={() => onSelect(i)}
          >
            {it.label}
          </button>
        ))}
        <div style={{ height: itemHeight * 2 }} aria-hidden="true" />
      </div>
    </div>
  );
}

function SongRow({
  song,
  href,
  artSrc,
  artAlt,
  artOwn,
  isOpen,
  instantClose,
  navigable,
  onToggle,
}: {
  song: SongCardData;
  href: string;
  artSrc: string | null;
  artAlt: string;
  artOwn: boolean;
  isOpen: boolean;
  instantClose: boolean;
  navigable: boolean;
  onToggle: () => void;
}) {
  const cardStyle = artOwn
    ? focalCropStyle(song.card_focal_x, song.card_focal_y, song.card_zoom)
    : undefined;
  // Forthcoming: no effective release date (on a not-yet-dated release) and not
  // a single — flagged with colored row cells + a glowing badge.
  const forthcoming = songDate(song) === null && !song.is_single;

  // Expand/collapse animation: keep the drawer mounted through a "closing"
  // phase so the exit (digital scan-out) can play before it unmounts.
  const [drawerPhase, setDrawerPhase] = useState<"closed" | "open" | "closing">(
    isOpen ? "open" : "closed"
  );
  useEffect(() => {
    if (isOpen) setDrawerPhase("open");
    // Switching to another song: drop instantly so the layout settles in one
    // step (a delayed unmount would jump the page). Plain close still animates.
    else if (instantClose) setDrawerPhase("closed");
    else setDrawerPhase((p) => (p === "closed" ? "closed" : "closing"));
  }, [isOpen, instantClose]);
  // Finalize the close on a timer (animation-duration + buffer) — reliable even
  // under prefers-reduced-motion, where animationend never fires.
  useEffect(() => {
    if (drawerPhase !== "closing") return;
    const t = setTimeout(() => setDrawerPhase("closed"), 240);
    return () => clearTimeout(t);
  }, [drawerPhase]);
  const showDrawer = drawerPhase !== "closed";

  return (
    <>
      <tr
        className={`songs-explorer__row${isOpen ? " is-open" : ""}${forthcoming ? " is-forthcoming" : ""}`}
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
            <Image
              src={artSrc}
              alt={artAlt}
              width={120}
              height={120}
              sizes="60px"
              className="songs-explorer__row-art"
              style={cardStyle}
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
              {song.is_single && (
                <span className="songs-explorer__row-single-badge"> · Single</span>
              )}
            </>
          ) : song.is_single ? (
            <em>Single</em>
          ) : forthcoming ? null : (
            <span className="songs-explorer__row-muted">—</span>
          )}
          {forthcoming && (
            <span className="songs-explorer__row-forthcoming">Forthcoming</span>
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

      {showDrawer && (() => {
        const trimmedSecondary = song.secondary_keyphrases.filter((k) => k.trim());
        const trimmedEntities = song.entity_tags.filter((e) => e.trim());
        const halfPaa = halfArray(song.paa_pairs);
        const halfSecondary = halfArray(trimmedSecondary);
        const halfEntities = halfArray(trimmedEntities);

        return (
          <tr className="songs-explorer__drawer-row">
            <td colSpan={5} className="songs-explorer__drawer-cell">
              <div
                className={`songs-explorer__drawer ${drawerPhase === "closing" ? "is-closing" : "is-opening"}`}
              >
                <div className="songs-explorer__drawer-art-col">
                  {artSrc ? (
                    <Image
                      src={artSrc}
                      alt={artAlt}
                      width={800}
                      height={800}
                      sizes="(max-width: 640px) 80vw, 400px"
                      className="songs-explorer__drawer-art"
                      style={cardStyle}
                    />
                  ) : (
                    <div className="songs-explorer__drawer-art songs-explorer__drawer-art--empty" />
                  )}
                </div>

                <div className="songs-explorer__drawer-main">
                  {/* Topics live in the collapsed row on desktop; on mobile that
                      row hides them, so surface them here (mobile-only via CSS). */}
                  {song.topics.length > 0 && (
                    <section className="songs-explorer__drawer-section songs-explorer__drawer-topics">
                      <h3 className="songs-explorer__drawer-label">Topics</h3>
                      <div className="songs-explorer__drawer-topic-chips">
                        {song.topics.map((t) => (
                          <span key={t.id} className="songs-explorer__card-topic">{t.label}</span>
                        ))}
                      </div>
                    </section>
                  )}

                  {song.song_summary && (
                    <section className="songs-explorer__drawer-section">
                      <h3 className="songs-explorer__drawer-label">Summary</h3>
                      <p className="songs-explorer__drawer-prose">{firstTwoSentences(song.song_summary)}</p>
                    </section>
                  )}

                  {song.citation_summary && (
                    <section className="songs-explorer__drawer-section">
                      <h3 className="songs-explorer__drawer-label">In Brief</h3>
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
                      <span className="songs-explorer__drawer-meta-label">Themes</span>
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
