"use client";

import { useState, useEffect, useRef } from "react";

interface Song {
  id: string;
  album_id: string;
  title: string;
  slug: string;
  track_number: number;
  lyrics: string;
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
  const readerRef = useRef<HTMLDivElement>(null);

  const allSongs = [...singles, ...songs];

  // Deep linking — resolve hash on mount
  useEffect(() => {
    const hash = window.location.hash.replace("#", "");
    if (!hash) return;
    const song = allSongs.find((s) => s.slug === hash);
    if (song) {
      setExpandedGroups(new Set([song.album_id]));
      setActiveTrackSlug(song.slug);
    }
  }, []);

  // Update hash when track changes
  useEffect(() => {
    if (activeTrackSlug) {
      window.history.replaceState(null, "", `#${activeTrackSlug}`);
    }
  }, [activeTrackSlug]);

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
    if (window.innerWidth <= 768 && readerRef.current) {
      readerRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  const activeSong = activeTrackSlug
    ? allSongs.find((s) => s.slug === activeTrackSlug)
    : null;

  const activeAlbum = activeSong
    ? activeSong.album_id === "__singles__"
      ? { id: "__singles__", title: "Singles", slug: "singles" }
      : albums.find((a) => a.id === activeSong.album_id)
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
                  }`}
                  type="button"
                  onClick={() => selectTrack(song)}
                >
                  <span className="lb__track-num">{song.track_number}.</span>
                  <span className="lb__track-name">{song.title}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <article className="lb">
      {/* Sidebar TOC */}
      <nav className="lb__toc" aria-label="Lyric book table of contents">
        <div className="lb__toc-inner">
          <h1 className="lb__toc-title">Lyric Book</h1>

          {/* Singles first */}
          {renderGroup("__singles__", "Singles", undefined, singles)}

          {/* Albums in reverse chronological order (already sorted by page) */}
          {albums.map((album) => {
            const albumSongs = songs.filter((s) => s.album_id === album.id);
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
                  {activeSong.album_id !== "__singles__" &&
                    ` · Track ${activeSong.track_number}`}
                </p>
              </header>
              <div className="lb__lyrics-body">
                {activeSong.lyrics
                  .replace(/\\r\\n/g, "\n")
                  .replace(/\\n/g, "\n")
                  .replace(/\\r/g, "\n")}
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
