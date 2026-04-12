"use client";

import { useState, useEffect, useCallback, useImperativeHandle, forwardRef } from "react";
import { VISIBILITY_CATEGORIES, type SongVisibilitySection } from "@/lib/song-visibility";
import { useAutosave } from "@/hooks/useAutosave";

interface SectionEditorProps {
  section: SongVisibilitySection;
  label: string;
}

function SectionEditor({ section, label }: SectionEditorProps) {
  const [content, setContent] = useState(section.content);
  const [status, setStatus] = useState(section.status);
  const [expanded, setExpanded] = useState(false);

  // Sync from parent when section data refreshes
  useEffect(() => {
    setContent(section.content);
    setStatus(section.status);
  }, [section.content, section.status]);

  const buildPayload = useCallback(
    () => ({ content, status }),
    [content, status]
  );

  const { status: saveStatus } = useAutosave({
    data: { content, status },
    endpoint: "/api/admin/song-visibility-sections",
    id: section.id,
    buildPayload,
    enabled: true,
  });

  return (
    <div className="song-visibility__section">
      <button
        type="button"
        className="song-visibility__section-header"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="song-visibility__section-arrow">{expanded ? "▾" : "▸"}</span>
        <span className="song-visibility__section-label">{label}</span>
        <span className={`song-visibility__section-badge song-visibility__section-badge--${content ? status : "empty"}`}>
          {content ? status : "empty"}
        </span>
        {saveStatus === "saving" && (
          <span style={{ color: "var(--text-tertiary)", fontSize: "0.7rem", marginLeft: "auto" }}>Saving...</span>
        )}
      </button>
      {expanded && (
        <div className="song-visibility__section-body">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="obsv-editor__textarea"
            rows={8}
            style={{ fontFamily: "var(--font-ui)", fontSize: "0.875rem" }}
            placeholder="No content generated yet..."
          />
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.5rem" }}>
            <label style={{ fontFamily: "var(--font-ui)", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
              Status:
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as "draft" | "published")}
              className="obsv-editor__select"
              style={{ fontSize: "0.75rem" }}
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}

export interface SongVisibilitySectionsHandle {
  refresh: () => void;
}

export const SongVisibilitySections = forwardRef<
  SongVisibilitySectionsHandle,
  { songId: string }
>(function SongVisibilitySections({ songId }, ref) {
  const [sections, setSections] = useState<SongVisibilitySection[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSections = useCallback(() => {
    fetch(`/api/admin/song-visibility-sections?song_id=${songId}`)
      .then((r) => r.json())
      .then((data: SongVisibilitySection[]) => {
        setSections(data);
        setLoading(false);
      });
  }, [songId]);

  useEffect(() => {
    fetchSections();
  }, [fetchSections]);

  useImperativeHandle(ref, () => ({ refresh: fetchSections }), [fetchSections]);

  const filledCount = sections.filter((s) => s.content).length;

  if (loading) {
    return (
      <div className="song-visibility__sections">
        <p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>Loading...</p>
      </div>
    );
  }

  return (
    <div className="song-visibility__sections">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
        <h3 className="obsv-editor__panel-title" style={{ margin: 0 }}>Sections</h3>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
          {filledCount}/10
        </span>
      </div>
      {VISIBILITY_CATEGORIES.map((cat) => {
        const existing = sections.find((s) => s.category === cat.slug);
        if (!existing) {
          // No DB row yet — show as empty, non-editable
          return (
            <div key={cat.slug} className="song-visibility__section">
              <div className="song-visibility__section-header" style={{ cursor: "default", opacity: 0.5 }}>
                <span className="song-visibility__section-arrow">▸</span>
                <span className="song-visibility__section-label">{cat.label}</span>
                <span className="song-visibility__section-badge song-visibility__section-badge--empty">empty</span>
              </div>
            </div>
          );
        }
        return <SectionEditor key={cat.slug} section={existing} label={cat.label} />;
      })}
    </div>
  );
});
