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

interface PsycheEffect {
  id: string;
  label: string;
  slug: string;
  shadow: boolean;
  sort_order: number;
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
  effects: PsycheEffect[];
}

type SortMode = "newest" | "oldest" | "az" | "za";

interface SongsExplorerProps {
  songs: SongCardData[];
  allTopics: Topic[];
  allEffects: PsycheEffect[];
}

// How many topics show before the "Show all" expander (topics run ~100 deep;
// effects are a tight 20 and always fully shown).
const TOPIC_PREVIEW = 12;

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

export function SongsExplorer({ songs, allTopics, allEffects }: SongsExplorerProps) {
  // Multi-select facets. OR within a facet, AND across facets (standard ecom
  // faceting): a song matches when it has ANY selected topic AND ANY selected
  // effect. An empty facet imposes no constraint.
  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(new Set());
  const [selectedEffects, setSelectedEffects] = useState<Set<string>>(new Set());
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [showAllTopics, setShowAllTopics] = useState(false);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Which row (if any) should skip its close animation because it's being
  // swapped out for another — a delayed unmount would jump the layout.
  const switchClosingIdRef = useRef<string | null>(null);
  // Phone: the facet panel collapses behind a "Filters" trigger that opens a
  // bottom sheet holding the same controls.
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

  const toggleTopic = useCallback((id: string) => {
    setSelectedTopics((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleEffect = useCallback((id: string) => {
    setSelectedEffects((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearFilters = useCallback(() => {
    setSelectedTopics(new Set());
    setSelectedEffects(new Set());
  }, []);

  // Faceted counts: a topic's count reflects the OTHER facets' selections
  // (effects) and vice versa, so options stay explorable within their own facet.
  const { visible, topicCounts, effectCounts, baseTopicCounts } = useMemo(() => {
    const passesTopics = (s: SongCardData) =>
      selectedTopics.size === 0 || s.topics.some((t) => selectedTopics.has(t.id));
    const passesEffects = (s: SongCardData) =>
      selectedEffects.size === 0 || s.effects.some((e) => selectedEffects.has(e.id));

    const tc = new Map<string, number>();
    for (const s of songs) {
      if (!passesEffects(s)) continue;
      for (const t of s.topics) tc.set(t.id, (tc.get(t.id) || 0) + 1);
    }
    const ec = new Map<string, number>();
    for (const s of songs) {
      if (!passesTopics(s)) continue;
      for (const e of s.effects) ec.set(e.id, (ec.get(e.id) || 0) + 1);
    }
    const base = new Map<string, number>();
    for (const s of songs) for (const t of s.topics) base.set(t.id, (base.get(t.id) || 0) + 1);

    const filtered = songs.filter((s) => passesTopics(s) && passesEffects(s));
    switch (sortMode) {
      case "newest":
        filtered.sort((a, b) => {
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
        filtered.sort((a, b) => {
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
        filtered.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case "za":
        filtered.sort((a, b) => b.title.localeCompare(a.title));
        break;
    }
    return { visible: filtered, topicCounts: tc, effectCounts: ec, baseTopicCounts: base };
  }, [songs, selectedTopics, selectedEffects, sortMode]);

  // Topics ordered by overall frequency (most-used first) for the facet list.
  const orderedTopics = useMemo(
    () =>
      [...allTopics].sort(
        (a, b) =>
          (baseTopicCounts.get(b.id) || 0) - (baseTopicCounts.get(a.id) || 0) ||
          a.label.localeCompare(b.label),
      ),
    [allTopics, baseTopicCounts],
  );

  const seekableEffects = useMemo(() => allEffects.filter((e) => !e.shadow), [allEffects]);
  const shadowEffects = useMemo(() => allEffects.filter((e) => e.shadow), [allEffects]);

  const activeCount = selectedTopics.size + selectedEffects.size;

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
      }),
    );
  }

  const controls = (variant: "sidebar" | "sheet") => (
    <FilterControls
      variant={variant}
      sortMode={sortMode}
      onSort={setSortMode}
      seekableEffects={seekableEffects}
      shadowEffects={shadowEffects}
      selectedEffects={selectedEffects}
      onToggleEffect={toggleEffect}
      effectCounts={effectCounts}
      orderedTopics={orderedTopics}
      selectedTopics={selectedTopics}
      onToggleTopic={toggleTopic}
      topicCounts={topicCounts}
      showAllTopics={showAllTopics}
      onShowAllTopics={setShowAllTopics}
      activeCount={activeCount}
      onClear={clearFilters}
    />
  );

  return (
    <>
      <div className="songs-explorer__layout">
        <aside className="songs-explorer__sidebar" aria-label="Filters">
          {controls("sidebar")}
        </aside>

        <div className="songs-explorer__results">
          <div className="songs-explorer__resultbar">
            <button
              type="button"
              className={`songs-explorer__filter-trigger${activeCount ? " is-active" : ""}`}
              onClick={() => setFilterSheetOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={filterSheetOpen}
            >
              Filters{activeCount > 0 ? ` (${activeCount})` : ""}
            </button>
            <span className="songs-explorer__count">
              Showing {visible.length} of {songs.length} songs
            </span>
          </div>

          {visible.length === 0 ? (
            <p className="songs-explorer__empty">No songs match these filters.</p>
          ) : (
            <table className="songs-explorer__table">
              <colgroup>
                <col className="col--art" />
                <col className="col--title" />
                <col className="col--release" />
                <col className="col--action" />
              </colgroup>
              <thead>
                <tr>
                  <th className="songs-explorer__th songs-explorer__th--art" aria-label="Art" />
                  <th className="songs-explorer__th">Title</th>
                  <th className="songs-explorer__th">Release</th>
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
        </div>
      </div>

      {/* Phone filter sheet — same controls as the sidebar. Filtering is live,
          so the footer just dismisses; selections already applied behind it. */}
      {filterSheetOpen && (
        <div
          className="songs-explorer__sheet-overlay"
          onClick={() => setFilterSheetOpen(false)}
        >
          <div
            className="songs-explorer__sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Filters"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="songs-explorer__sheet-header">
              <span className="songs-explorer__sheet-title">Filters</span>
              <button
                type="button"
                className="songs-explorer__sheet-close"
                onClick={() => setFilterSheetOpen(false)}
                aria-label="Close filters"
              >
                &times;
              </button>
            </div>
            <div className="songs-explorer__sheet-body">{controls("sheet")}</div>
            <div className="songs-explorer__sheet-footer">
              <button
                type="button"
                className="songs-explorer__sheet-clear"
                onClick={clearFilters}
                disabled={activeCount === 0}
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
    </>
  );
}

interface FilterControlsProps {
  variant: "sidebar" | "sheet";
  sortMode: SortMode;
  onSort: (m: SortMode) => void;
  seekableEffects: PsycheEffect[];
  shadowEffects: PsycheEffect[];
  selectedEffects: Set<string>;
  onToggleEffect: (id: string) => void;
  effectCounts: Map<string, number>;
  orderedTopics: Topic[];
  selectedTopics: Set<string>;
  onToggleTopic: (id: string) => void;
  topicCounts: Map<string, number>;
  showAllTopics: boolean;
  onShowAllTopics: (v: boolean) => void;
  activeCount: number;
  onClear: () => void;
}

function FilterControls({
  variant,
  sortMode,
  onSort,
  seekableEffects,
  shadowEffects,
  selectedEffects,
  onToggleEffect,
  effectCounts,
  orderedTopics,
  selectedTopics,
  onToggleTopic,
  topicCounts,
  showAllTopics,
  onShowAllTopics,
  activeCount,
  onClear,
}: FilterControlsProps) {
  const sortId = `songs-sort-${variant}`;

  // Keep any selected-but-hidden topic visible even when the list is collapsed.
  const shownTopics = showAllTopics
    ? orderedTopics
    : [
        ...orderedTopics.slice(0, TOPIC_PREVIEW),
        ...orderedTopics.slice(TOPIC_PREVIEW).filter((t) => selectedTopics.has(t.id)),
      ];

  return (
    <div className="songs-explorer__filters">
      {/* The sheet has its own header + footer Clear, so only the sidebar
          renders this row. */}
      {variant === "sidebar" && (
        <div className="songs-explorer__filter-head">
          <span className="songs-explorer__filter-title">Filter</span>
          {activeCount > 0 && (
            <button type="button" className="songs-explorer__clear" onClick={onClear}>
              Clear ({activeCount})
            </button>
          )}
        </div>
      )}

      <div className="songs-explorer__facet songs-explorer__facet--sort">
        <label className="songs-explorer__facet-heading" htmlFor={sortId}>
          Sort
        </label>
        <select
          id={sortId}
          className="songs-explorer__sort-select"
          value={sortMode}
          onChange={(e) => onSort(e.target.value as SortMode)}
        >
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="az">A–Z</option>
          <option value="za">Z–A</option>
        </select>
      </div>

      <div className="songs-explorer__facet">
        <h3 className="songs-explorer__facet-heading">Psyche Effects</h3>
        <ul className="songs-explorer__facet-list">
          {seekableEffects.map((e) => (
            <FacetOption
              key={e.id}
              id={e.id}
              label={e.label}
              count={effectCounts.get(e.id) || 0}
              checked={selectedEffects.has(e.id)}
              onToggle={onToggleEffect}
            />
          ))}
        </ul>
        {shadowEffects.length > 0 && (
          <>
            <div className="songs-explorer__facet-subhead">Shadow</div>
            <ul className="songs-explorer__facet-list">
              {shadowEffects.map((e) => (
                <FacetOption
                  key={e.id}
                  id={e.id}
                  label={e.label}
                  count={effectCounts.get(e.id) || 0}
                  checked={selectedEffects.has(e.id)}
                  onToggle={onToggleEffect}
                  shadow
                />
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="songs-explorer__facet">
        <h3 className="songs-explorer__facet-heading">Topics</h3>
        <ul className="songs-explorer__facet-list">
          {shownTopics.map((t) => (
            <FacetOption
              key={t.id}
              id={t.id}
              label={t.label}
              count={topicCounts.get(t.id) || 0}
              checked={selectedTopics.has(t.id)}
              onToggle={onToggleTopic}
            />
          ))}
        </ul>
        {orderedTopics.length > TOPIC_PREVIEW && (
          <button
            type="button"
            className="songs-explorer__facet-more"
            onClick={() => onShowAllTopics(!showAllTopics)}
          >
            {showAllTopics ? "Show less" : `Show all ${orderedTopics.length}`}
          </button>
        )}
      </div>
    </div>
  );
}

function FacetOption({
  id,
  label,
  count,
  checked,
  onToggle,
  shadow = false,
}: {
  id: string;
  label: string;
  count: number;
  checked: boolean;
  onToggle: (id: string) => void;
  shadow?: boolean;
}) {
  // A zero-count option that isn't already selected can't help — disable it.
  const disabled = count === 0 && !checked;
  return (
    <li>
      <label
        className={`songs-explorer__opt${checked ? " is-checked" : ""}${
          disabled ? " is-disabled" : ""
        }${shadow ? " songs-explorer__opt--shadow" : ""}`}
      >
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={() => onToggle(id)}
        />
        <span className="songs-explorer__opt-box" aria-hidden="true" />
        <span className="songs-explorer__opt-label">{label}</span>
        <span className="songs-explorer__opt-count">{count}</span>
      </label>
    </li>
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
    isOpen ? "open" : "closed",
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
            <td colSpan={4} className="songs-explorer__drawer-cell">
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
                  {song.effects.length > 0 && (
                    <section className="songs-explorer__drawer-section">
                      <h3 className="songs-explorer__drawer-label">Psyche Effects</h3>
                      <div className="songs-explorer__drawer-topic-chips">
                        {song.effects.map((e) => (
                          <span
                            key={e.id}
                            className={`songs-explorer__card-effect${e.shadow ? " songs-explorer__card-effect--shadow" : ""}`}
                          >
                            {e.label}
                          </span>
                        ))}
                      </div>
                    </section>
                  )}

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
