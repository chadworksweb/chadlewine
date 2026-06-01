"use client";

import { useMemo, useState } from "react";
import Image from "next/image";

// The venue co-curates the night. They browse Chad's full catalog, optionally
// narrow by theme or title, and tap songs to build a requested set. The CTA
// composes a mailto to booking@ with the chosen titles plus the space/date
// fields pre-stubbed -- matching the rest of the page's email-based flow, so
// there is no backend form to maintain. "Let Chad shape the arc" hands the
// curation back to Chad and the email says so.

const BOOKING_EMAIL = "booking@chadlewine.com";

export interface SetlistSong {
  id: string;
  title: string;
  slug: string;
  art: string | null;
  alt: string;
  topics: { label: string; slug: string }[];
}

export interface SetlistTopic {
  label: string;
  slug: string;
}

interface SetlistPickerProps {
  songs: SetlistSong[];
  topics: SetlistTopic[];
}

// The catalog carries ~100 granular themes. Show the most-used handful as
// chips and tuck the rest behind a toggle so the filter row stays scannable.
const TOP_TOPICS = 12;

function CheckGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function SetlistPicker({ songs, topics }: SetlistPickerProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeTopic, setActiveTopic] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [letChad, setLetChad] = useState(false);
  const [showAllTopics, setShowAllTopics] = useState(false);

  // Keep the active theme visible even when it lives in the collapsed tail.
  const visibleTopics = useMemo(() => {
    if (showAllTopics) return topics;
    const top = topics.slice(0, TOP_TOPICS);
    if (activeTopic && !top.some((t) => t.slug === activeTopic)) {
      const extra = topics.find((t) => t.slug === activeTopic);
      if (extra) return [...top, extra];
    }
    return top;
  }, [showAllTopics, topics, activeTopic]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return songs.filter((s) => {
      if (activeTopic && !s.topics.some((t) => t.slug === activeTopic)) return false;
      if (q && !s.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [songs, activeTopic, query]);

  const selectedSongs = useMemo(
    () => songs.filter((s) => selected.has(s.id)),
    [songs, selected],
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const mailto = useMemo(() => {
    const subject = "Super Individual Night - booking + setlist";
    const lines: string[] = [
      "Hi Chad,",
      "",
      "We would like to host a Super Individual Night at our space.",
      "",
      "Space / city: ",
      "Room type (sound-bath room / studio / gallery / sanctuary / other): ",
      "Possible date(s): ",
      "Roughly how many people: ",
      "",
    ];
    if (letChad || selectedSongs.length === 0) {
      lines.push("Setlist: we trust you to shape the arc for our room.");
    } else {
      lines.push(`Songs we would love to hear (${selectedSongs.length}):`);
      selectedSongs.forEach((s, i) => lines.push(`${i + 1}. ${s.title}`));
    }
    lines.push("");
    lines.push("Anything else: ");
    const body = lines.join("\n");
    return `mailto:${BOOKING_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }, [selectedSongs, letChad]);

  const count = selectedSongs.length;

  return (
    <div className="setlist">
      <div className="setlist__controls">
        <input
          type="search"
          className="setlist__search"
          placeholder="Search songs by title..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search songs by title"
        />
        <label className="setlist__handoff">
          <input
            type="checkbox"
            checked={letChad}
            onChange={(e) => setLetChad(e.target.checked)}
          />
          <span>Let Chad shape the arc</span>
        </label>
      </div>

      {topics.length > 0 && (
        <div className="setlist__topics" role="group" aria-label="Filter songs by theme">
          <button
            type="button"
            className={`setlist__chip${activeTopic === null ? " setlist__chip--active" : ""}`}
            onClick={() => setActiveTopic(null)}
          >
            All themes
          </button>
          {visibleTopics.map((t) => (
            <button
              type="button"
              key={t.slug}
              className={`setlist__chip${activeTopic === t.slug ? " setlist__chip--active" : ""}`}
              onClick={() => setActiveTopic((cur) => (cur === t.slug ? null : t.slug))}
            >
              {t.label}
            </button>
          ))}
          {topics.length > TOP_TOPICS && (
            <button
              type="button"
              className="setlist__chip setlist__chip--more"
              onClick={() => setShowAllTopics((v) => !v)}
              aria-expanded={showAllTopics}
            >
              {showAllTopics ? "Fewer themes" : `+${topics.length - TOP_TOPICS} more`}
            </button>
          )}
        </div>
      )}

      <p className="setlist__hint" aria-live="polite">
        {letChad
          ? "You have handed the set to Chad -- he will read your room and build the arc."
          : count > 0
            ? `${count} song${count === 1 ? "" : "s"} chosen. Pick as many or as few as you like.`
            : "Tap the songs you want in the room. Pick a few, pick a theme, or leave it to Chad."}
      </p>

      <ul className={`setlist__grid${letChad ? " setlist__grid--muted" : ""}`}>
        {filtered.map((s) => {
          const isSel = selected.has(s.id);
          return (
            <li key={s.id} className="setlist__cell">
              <button
                type="button"
                className={`setlist__card${isSel ? " setlist__card--selected" : ""}`}
                onClick={() => toggle(s.id)}
                aria-pressed={isSel}
                aria-label={`${isSel ? "Remove" : "Add"} ${s.title} ${isSel ? "from" : "to"} the set`}
                disabled={letChad}
              >
                <span className="setlist__thumb">
                  {s.art ? (
                    <Image
                      src={s.art}
                      alt={s.alt}
                      width={160}
                      height={160}
                      sizes="160px"
                      className="setlist__thumb-img"
                    />
                  ) : (
                    <span className="setlist__thumb-img setlist__thumb-img--empty" aria-hidden="true" />
                  )}
                  <span className="setlist__check" aria-hidden="true">
                    <CheckGlyph />
                  </span>
                </span>
              </button>
              <a
                className="setlist__songlink"
                href={`/music/songs/${s.slug}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {s.title}
                <span className="setlist__songlink-ext" aria-hidden="true"> &#8599;</span>
              </a>
            </li>
          );
        })}
      </ul>

      {filtered.length === 0 && (
        <p className="setlist__empty">No songs match that filter. Clear the search or theme to see the whole catalog.</p>
      )}

      <div className="setlist__bar">
        <div className="setlist__bar-status">
          {letChad ? (
            <span className="setlist__bar-count">Chad shapes the arc</span>
          ) : (
            <>
              <span className="setlist__bar-count">{count} chosen</span>
              {count > 0 && (
                <button type="button" className="setlist__clear" onClick={() => setSelected(new Set())}>
                  Clear
                </button>
              )}
            </>
          )}
        </div>
        <a className="setlist__cta" href={mailto}>
          {count > 0 && !letChad ? "Send this set + book a night" : "Book a night"}
        </a>
      </div>
    </div>
  );
}
