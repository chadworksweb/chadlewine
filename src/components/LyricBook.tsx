"use client";

import { useState, useEffect, useRef } from "react";

interface Song {
  id: string;
  release_id: string;
  title: string;
  slug: string;
  track_number: number;
  lyrics: string;
  instrumental: boolean;
}

interface Album {
  id: string;
  title: string;
  slug: string;
  release_year?: string;
}

interface LyricBookProps {
  albums: Album[];
  songs: Song[];
  singles: Song[];
}

export default function LyricBook({ albums, songs, singles }: LyricBookProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [activeTrackSlug, setActiveTrackSlug] = useState<string | null>(null);
  // Mobile only: the TOC is a bottom drawer. It opens to the releases menu by
  // default; picking a song slides it down to a tab. Desktop ignores this.
  const [drawerOpen, setDrawerOpen] = useState(true);
  const readerRef = useRef<HTMLDivElement>(null);

  const allSongs = [...singles, ...songs];

  // Deep linking — resolve hash on mount.
  useEffect(() => {
    const hash = window.location.hash.replace("#", "");
    if (!hash) return;
    const song = allSongs.find((s) => s.slug === hash);
    if (song) {
      setExpandedGroups(new Set([song.release_id]));
      setActiveTrackSlug(song.slug);
      setDrawerOpen(false); // land on the lyrics, drawer tucked away
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only; allSongs derives from props
  }, []);

  // Lock background scroll while the menu/drawer covers the screen (mobile).
  // Expanded = menu mode (no song picked yet) or an open drawer. When reading
  // with the drawer closed (tab peeking), the lyrics are the page, so scrolling
  // stays on. Unlocking is delayed past the close slide so toggling body
  // overflow doesn't reflow mid-animation and stutter it.
  useEffect(() => {
    const expanded = !activeTrackSlug || drawerOpen;
    const root = document.documentElement;
    if (expanded) {
      root.classList.add("lb-locked");
      return;
    }
    const t = window.setTimeout(() => root.classList.remove("lb-locked"), 480);
    return () => window.clearTimeout(t);
  }, [activeTrackSlug, drawerOpen]);

  // Clear the lock if we unmount while it's still applied.
  useEffect(
    () => () => document.documentElement.classList.remove("lb-locked"),
    [],
  );

  function toggleGroup(groupId: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  function selectTrack(song: Song) {
    setActiveTrackSlug(song.slug);
    setDrawerOpen(false); // drop the menu away; lyrics + sticky pull tab take over
    // Reset to the top so the new song's header shows first.
    readerRef.current?.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
  }

  const activeSong = activeTrackSlug
    ? allSongs.find((s) => s.slug === activeTrackSlug)
    : null;

  const activeAlbum = activeSong
    ? activeSong.release_id === "__singles__"
      ? { id: "__singles__", title: "Singles", slug: "singles" }
      : albums.find((a) => a.id === activeSong.release_id)
    : null;

  const activeAlbumYear =
    activeAlbum && "release_year" in activeAlbum
      ? (activeAlbum as Album).release_year
      : undefined;

  // Render a group (singles or album)
  function renderGroup(
    groupId: string,
    title: string,
    year: string | undefined,
    groupSongs: Song[]
  ) {
    if (groupSongs.length === 0) return null;
    const isExpanded = expandedGroups.has(groupId);

    return (
      <div key={groupId} className="lb__album">
        <button
          className="lb__album-header"
          type="button"
          aria-expanded={isExpanded}
          onClick={() => toggleGroup(groupId)}
        >
          <span className="lb__album-name">{title}</span>
          <span className="lb__album-meta">
            {year && <span className="lb__album-year">{year}</span>}
            <span className="lb__chevron" aria-hidden="true">
              &#x25B8;
            </span>
          </span>
        </button>

        {isExpanded && (
          <ul className="lb__tracklist" role="list">
            {groupSongs.map((song) => (
              <li key={song.id} className="lb__track">
                <button
                  className={`lb__track-btn${
                    activeTrackSlug === song.slug ? " lb__track-btn--active" : ""
                  }${song.instrumental ? " lb__track-btn--instrumental" : ""}`}
                  type="button"
                  disabled={song.instrumental}
                  onClick={song.instrumental ? undefined : () => selectTrack(song)}
                >
                  <span className="lb__track-num">{song.track_number}.</span>
                  <span className="lb__track-name">{song.title}</span>
                  {song.instrumental && (
                    <span className="lb__track-tag" style={{ marginLeft: "0.5rem", fontSize: "0.65rem", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      [Instrumental]
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <article
      className={`lb${activeSong ? " lb--reading" : ""}${
        drawerOpen ? " lb--drawer-open" : ""
      }`}
    >
      {/* TOC — sidebar on desktop; on mobile, the bottom drawer. The pull tab
          is its top edge: it peeks at the bottom when closed and rides up with
          the drawer when opened. */}
      <nav className="lb__toc" aria-label="Lyric book table of contents">
        {/* Pull tab — top of the drawer; one tap toggles the list. */}
        <button
          type="button"
          className="lb__pull"
          aria-controls="lb-toc-inner"
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen((open) => !open)}
        >
          <span className="lb__pull-frame" aria-hidden="true">
            <span className="logo-shape">&#x2591;</span>
            <span className="logo-shape">&#x2592;</span>
            <span className="logo-shape">&#x2593;</span>
            <span className="logo-shape">&#x2588;</span>
          </span>
          <span className="lb__pull-label">Choose another song</span>
          <span className="lb__pull-frame" aria-hidden="true">
            <span className="logo-shape">&#x2588;</span>
            <span className="logo-shape">&#x2593;</span>
            <span className="logo-shape">&#x2592;</span>
            <span className="logo-shape">&#x2591;</span>
          </span>
        </button>

        <div className="lb__toc-inner" id="lb-toc-inner">
          <h1 className="lb__toc-title">Lyric Book</h1>

          {/* Singles first */}
          {renderGroup("__singles__", "Singles", undefined, singles)}

          {/* Albums in reverse chronological order (already sorted by page) */}
          {albums.map((album) => {
            const albumSongs = songs.filter((s) => s.release_id === album.id);
            return renderGroup(album.id, album.title, album.release_year, albumSongs);
          })}
        </div>
      </nav>

      {/* Reading Pane */}
      <section className="lb__reader" ref={readerRef} aria-live="polite">
        <div className="lb__reader-inner">
          {activeSong && activeAlbum ? (
            <div className="lb__lyrics">
              <header className="lb__lyrics-header">
                <h2 className="lb__lyrics-title">{activeSong.title}</h2>
                <p className="lb__lyrics-meta">
                  {activeAlbum.title}
                  {activeAlbumYear && ` · ${activeAlbumYear}`}
                  {activeSong.release_id !== "__singles__" &&
                    ` · Track ${activeSong.track_number}`}
                </p>
              </header>
              <div className="lb__lyrics-body">
                {activeSong.instrumental ? (
                  <p style={{ color: "var(--text-tertiary)", fontStyle: "italic" }}>
                    Instrumental — no lyrics.
                  </p>
                ) : (
                  activeSong.lyrics
                    .replace(/\\r\\n/g, "\n")
                    .replace(/\\n/g, "\n")
                    .replace(/\\r/g, "\n")
                )}
              </div>
            </div>
          ) : (
            <div className="lb__welcome">
              <div className="lb__welcome-icon" aria-hidden="true">
                &#x266B;
              </div>
              <h2 className="lb__welcome-heading">Select a Track</h2>
              <p className="lb__welcome-text">
                Choose a song from the table of contents to read its lyrics.
              </p>
            </div>
          )}
        </div>
      </section>
    </article>
  );
}
