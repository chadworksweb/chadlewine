"use client";

import { useState, useEffect, useCallback, useImperativeHandle, forwardRef } from "react";
import { VISIBILITY_CATEGORIES, type SongVisibilitySection } from "@/lib/song-visibility";
import { useAutosave } from "@/hooks/useAutosave";

interface SectionEditorProps {
  section: SongVisibilitySection;
  label: string;
}

const fieldLabel: React.CSSProperties = {
  fontFamily: "var(--font-ui)",
  fontSize: "0.7rem",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "var(--text-tertiary)",
  margin: "0.75rem 0 0.25rem",
};

const fieldLabelFirst: React.CSSProperties = { ...fieldLabel, margin: "0 0 0.25rem" };

function SectionEditor({ section, label }: SectionEditorProps) {
  const [directAnswer, setDirectAnswer] = useState(section.direct_answer || "");
  const [content, setContent] = useState(section.content);
  const [keyPointsRaw, setKeyPointsRaw] = useState((section.key_points || []).join("\n"));
  const [status, setStatus] = useState(section.status);
  const [expanded, setExpanded] = useState(false);

  // Sync from parent when section data refreshes
  useEffect(() => {
    setDirectAnswer(section.direct_answer || "");
    setContent(section.content);
    setKeyPointsRaw((section.key_points || []).join("\n"));
    setStatus(section.status);
  }, [section.content, section.status, section.direct_answer, section.key_points]);

  const buildPayload = useCallback(
    () => ({
      direct_answer: directAnswer || null,
      content,
      key_points: keyPointsRaw.split("\n").map((l) => l.trim()).filter(Boolean),
      status,
    }),
    [directAnswer, content, keyPointsRaw, status]
  );

  const { status: saveStatus } = useAutosave({
    data: { directAnswer, content, keyPointsRaw, status },
    endpoint: "/api/admin/song-visibility-sections",
    id: section.id,
    buildPayload,
    enabled: true,
  });

  const hasContent = directAnswer || content || keyPointsRaw.trim();

  return (
    <div className="song-visibility__section">
      <button
        type="button"
        className="song-visibility__section-header"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="song-visibility__section-arrow">{expanded ? "▾" : "▸"}</span>
        <span className="song-visibility__section-label">{label}</span>
        <span className={`song-visibility__section-badge song-visibility__section-badge--${hasContent ? status : "empty"}`}>
          {hasContent ? status : "empty"}
        </span>
        {saveStatus === "saving" && (
          <span style={{ color: "var(--text-tertiary)", fontSize: "0.7rem", marginLeft: "auto" }}>Saving...</span>
        )}
      </button>
      {expanded && (
        <div className="song-visibility__section-body">
          <div style={fieldLabelFirst}>Direct Answer</div>
          <textarea
            value={directAnswer}
            onChange={(e) => setDirectAnswer(e.target.value)}
            className="obsv-editor__textarea"
            rows={2}
            style={{ fontFamily: "var(--font-ui)", fontSize: "0.85rem" }}
            placeholder="40-60 word standalone extractable block..."
          />

          <div style={fieldLabel}>Prose</div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="obsv-editor__textarea"
            rows={6}
            style={{ fontFamily: "var(--font-ui)", fontSize: "0.85rem" }}
            placeholder="Expanded narrative (markdown)..."
          />

          <div style={fieldLabel}>Key Points</div>
          <textarea
            value={keyPointsRaw}
            onChange={(e) => setKeyPointsRaw(e.target.value)}
            className="obsv-editor__textarea"
            rows={4}
            style={{ fontFamily: "var(--font-ui)", fontSize: "0.85rem" }}
            placeholder="One bullet per line..."
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

  const filledCount = sections.filter((s) => s.content || s.direct_answer).length;
  const [publishing, setPublishing] = useState(false);

  const hasDrafts = sections.some((s) => (s.content || s.direct_answer) && s.status === "draft");

  async function publishAll() {
    setPublishing(true);
    const drafts = sections.filter((s) => (s.content || s.direct_answer) && s.status === "draft");
    await Promise.all(
      drafts.map((s) =>
        fetch(`/api/admin/song-visibility-sections/${s.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "published" }),
        })
      )
    );
    fetchSections();
    setPublishing(false);
  }

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
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {hasDrafts && (
            <button
              type="button"
              className="admin-btn"
              onClick={publishAll}
              disabled={publishing}
              style={{ fontSize: "0.7rem", padding: "0.2rem 0.5rem" }}
            >
              {publishing ? "Publishing..." : "Publish All"}
            </button>
          )}
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
            {filledCount}/{VISIBILITY_CATEGORIES.length}
          </span>
        </div>
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
