"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { SongVisibilityChat } from "@/components/SongVisibilityChat";
import { SongVisibilitySections, type SongVisibilitySectionsHandle } from "@/components/SongVisibilitySections";
import type { SongVisibilitySection } from "@/lib/song-visibility";

export default function SongVisibilityPage() {
  const { id: songId } = useParams() as { id: string };
  const [songTitle, setSongTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [rawSections, setRawSections] = useState<SongVisibilitySection[]>([]);
  const sectionsRef = useRef<SongVisibilitySectionsHandle>(null);

  useEffect(() => {
    Promise.all([
      fetch(`/api/admin/songs/${songId}`).then((r) => r.json()),
      fetch(`/api/admin/song-visibility-sections?song_id=${songId}`).then((r) => r.json()),
    ]).then(([song, sections]) => {
      setSongTitle(song.title || "");
      setRawSections(sections || []);
      setLoading(false);
    });
  }, [songId]);

  function handleSectionsUpdated() {
    sectionsRef.current?.refresh();
    fetch(`/api/admin/song-visibility-sections?song_id=${songId}`)
      .then((r) => r.json())
      .then((sections) => setRawSections(sections || []));
  }

  if (loading) {
    return (
      <div className="admin-page">
        <p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>Loading...</p>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div style={{ marginBottom: "1.5rem" }}>
        <Link
          href={`/admin/music/songs/${songId}`}
          style={{ color: "var(--text-link)", fontFamily: "var(--font-ui)", fontSize: "0.875rem" }}
        >
          &larr; Back to {songTitle || "Song"}
        </Link>
        <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "1.5rem", color: "var(--text-primary)", margin: "0.5rem 0 0" }}>
          Visibility: {songTitle}
        </h1>
      </div>

      <div className="obsv-editor__grid">
        <div className="obsv-editor__main">
          <SongVisibilityChat
            songId={songId}
            onSectionsUpdated={handleSectionsUpdated}
          />
        </div>
        <div className="obsv-editor__sidebar">
          <SongVisibilitySections ref={sectionsRef} songId={songId} />
        </div>
      </div>

    </div>
  );
}
