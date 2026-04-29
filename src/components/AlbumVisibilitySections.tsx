"use client";

import { useState, useEffect, useCallback, useImperativeHandle, forwardRef, useRef } from "react";
import {
  ALBUM_VISIBILITY_CATEGORIES,
  type AlbumVisibilitySection,
  type AlbumVisibilityCategoryDef,
} from "@/lib/album-visibility";
import { useAutosave } from "@/hooks/useAutosave";
import { AlbumDataSectionEditor } from "@/components/AlbumDataSectionEditor";
import { AlbumAboutSectionEditor } from "@/components/AlbumAboutSectionEditor";

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

interface NarrativeEditorProps {
  albumId: string;
  section: AlbumVisibilitySection;
  cat: AlbumVisibilityCategoryDef;
  onRegenerated: () => void;
}

function NarrativeSectionEditor({ albumId, section, cat, onRegenerated }: NarrativeEditorProps) {
  const [directAnswer, setDirectAnswer] = useState(section.direct_answer || "");
  const [content, setContent] = useState(section.content);
  const [keyPointsRaw, setKeyPointsRaw] = useState((section.key_points || []).join("\n"));
  const [status, setStatus] = useState(section.status);
  const [expanded, setExpanded] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [streamPreview, setStreamPreview] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  async function handleRegenerate() {
    setGenerating(true);
    setStreamPreview("");
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch("/api/admin/album-visibility-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ album_id: albumId, category: cat.slug }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        setGenerating(false);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.text) {
              acc += evt.text;
              setStreamPreview(acc);
            }
          } catch {}
        }
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        console.error("Regenerate error:", err);
      }
    } finally {
      abortRef.current = null;
      setGenerating(false);
      setStreamPreview("");
      onRegenerated();
    }
  }

  function handleStop() {
    abortRef.current?.abort();
  }

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
    [directAnswer, content, keyPointsRaw, status],
  );

  const { status: saveStatus } = useAutosave({
    data: { directAnswer, content, keyPointsRaw, status },
    endpoint: "/api/admin/album-visibility-sections",
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
        <span className="song-visibility__section-label">{cat.label}</span>
        <span className={`song-visibility__section-badge song-visibility__section-badge--${hasContent ? status : "empty"}`}>
          {hasContent ? status : "empty"}
        </span>
        {saveStatus === "saving" && (
          <span style={{ color: "var(--text-tertiary)", fontSize: "0.7rem", marginLeft: "auto" }}>Saving...</span>
        )}
      </button>
      {expanded && (
        <div className="song-visibility__section-body">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
            <button
              type="button"
              className={generating ? "admin-btn admin-btn--danger" : "admin-btn"}
              onClick={generating ? handleStop : handleRegenerate}
              style={{ fontSize: "0.7rem", padding: "0.2rem 0.5rem" }}
            >
              {generating ? "Stop" : hasContent ? "Regenerate" : "Generate"}
            </button>
          </div>

          {generating && streamPreview && (
            <pre className="song-visibility__stream-preview">
              {streamPreview}
              <span className="song-visibility__cursor">▊</span>
            </pre>
          )}

          <div style={fieldLabelFirst}>Direct Answer</div>
          <textarea
            value={directAnswer}
            onChange={(e) => setDirectAnswer(e.target.value)}
            className="obsv-editor__textarea"
            rows={2}
            style={{ fontFamily: "var(--font-ui)", fontSize: "0.85rem" }}
          />

          <div style={fieldLabel}>Prose</div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="obsv-editor__textarea"
            rows={6}
            style={{ fontFamily: "var(--font-ui)", fontSize: "0.85rem" }}
          />

          <div style={fieldLabel}>Key Points</div>
          <textarea
            value={keyPointsRaw}
            onChange={(e) => setKeyPointsRaw(e.target.value)}
            className="obsv-editor__textarea"
            rows={4}
            style={{ fontFamily: "var(--font-ui)", fontSize: "0.85rem" }}
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

export interface AlbumVisibilitySectionsHandle {
  refresh: () => void;
}

export const AlbumVisibilitySections = forwardRef<
  AlbumVisibilitySectionsHandle,
  { albumId: string }
>(function AlbumVisibilitySections({ albumId }, ref) {
  const [sections, setSections] = useState<AlbumVisibilitySection[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);

  const fetchSections = useCallback(() => {
    fetch(`/api/admin/album-visibility-sections?album_id=${encodeURIComponent(albumId)}`)
      .then((r) => r.json())
      .then((data: unknown) => {
        setSections(Array.isArray(data) ? (data as AlbumVisibilitySection[]) : []);
        setLoading(false);
      })
      .catch(() => {
        setSections([]);
        setLoading(false);
      });
  }, [albumId]);

  // Bootstrap: on first mount, ensure a row exists per category so each is editable.
  useEffect(() => {
    fetch("/api/admin/album-visibility-sections/bootstrap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ album_id: albumId }),
    }).then(() => fetchSections());
  }, [albumId, fetchSections]);

  useImperativeHandle(ref, () => ({ refresh: fetchSections }), [fetchSections]);

  const filledCount = sections.filter((s) => s.content || s.direct_answer || hasDataPayload(s)).length;
  const hasDrafts = sections.some(
    (s) => (s.content || s.direct_answer || hasDataPayload(s)) && s.status === "draft",
  );

  async function publishAll() {
    setPublishing(true);
    const drafts = sections.filter(
      (s) => (s.content || s.direct_answer || hasDataPayload(s)) && s.status === "draft",
    );
    await Promise.all(
      drafts.map((s) =>
        fetch(`/api/admin/album-visibility-sections/${s.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "published" }),
        }),
      ),
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
          <button
            type="button"
            className="admin-btn"
            onClick={publishAll}
            disabled={publishing || !hasDrafts}
            style={{ fontSize: "0.7rem", padding: "0.2rem 0.5rem" }}
          >
            {publishing ? "Publishing..." : "Publish All"}
          </button>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
            {filledCount}/{ALBUM_VISIBILITY_CATEGORIES.length}
          </span>
        </div>
      </div>

      <AlbumAboutSectionEditor albumId={albumId} />

      {ALBUM_VISIBILITY_CATEGORIES.map((cat) => {
        const existing = sections.find((s) => s.category === cat.slug);
        if (!existing) {
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
        if (cat.kind === "narrative") {
          return (
            <NarrativeSectionEditor
              key={cat.slug}
              albumId={albumId}
              section={existing}
              cat={cat}
              onRegenerated={fetchSections}
            />
          );
        }
        return (
          <AlbumDataSectionEditor
            key={cat.slug}
            albumId={albumId}
            section={existing}
            cat={cat}
            onChanged={fetchSections}
          />
        );
      })}
    </div>
  );
});

function hasDataPayload(s: AlbumVisibilitySection): boolean {
  if (!s.data_payload) return false;
  return Object.keys(s.data_payload).length > 0;
}
