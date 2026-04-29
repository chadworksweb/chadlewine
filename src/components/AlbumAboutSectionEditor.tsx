"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAutosave } from "@/hooks/useAutosave";

interface AlbumAboutShape {
  id: string;
  citation_summary: string | null;
  entity_tags: string[] | null;
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

export function AlbumAboutSectionEditor({ albumId }: { albumId: string }) {
  const [album, setAlbum] = useState<AlbumAboutShape | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [generating, setGenerating] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const [citationSummary, setCitationSummary] = useState("");
  const [entityTagsRaw, setEntityTagsRaw] = useState("");

  const fetchAlbum = useCallback(async () => {
    const res = await fetch(`/api/admin/albums/${encodeURIComponent(albumId)}`);
    if (!res.ok) {
      setLoading(false);
      return;
    }
    const data = (await res.json()) as AlbumAboutShape;
    setAlbum(data);
    setCitationSummary(data.citation_summary || "");
    setEntityTagsRaw((data.entity_tags || []).join("\n"));
    setLoading(false);
  }, [albumId]);

  useEffect(() => {
    fetchAlbum();
  }, [fetchAlbum]);

  const buildPayload = useCallback(
    () => ({
      citation_summary: citationSummary || null,
      entity_tags: entityTagsRaw.split("\n").map((l) => l.trim()).filter(Boolean),
    }),
    [citationSummary, entityTagsRaw],
  );

  const { status: saveStatus } = useAutosave({
    data: { citationSummary, entityTagsRaw },
    endpoint: "/api/admin/albums",
    id: album?.id,
    buildPayload,
    enabled: !!album?.id,
  });

  async function handleGenerate() {
    if (!album?.id) return;
    setGenerating(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch("/api/admin/album-visibility-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ album_id: album.id, geoOnly: true }),
        signal: controller.signal,
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) {
        alert(`Refresh About failed: ${body?.error || res.statusText}\n\n${body?.raw ? `Claude said:\n${body.raw}` : ""}`);
        return;
      }
      if (body.partial) {
        alert(`Partial success.\nWrote: ${body.entity_tags ? "entity_tags" : ""}${body.entity_tags && body.citation_summary ? ", " : ""}${body.citation_summary ? "citation_summary" : ""}\nFailed: ${body.partial}`);
      }
      await fetchAlbum();
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        alert(`Refresh About error: ${(err as Error).message}`);
      }
    } finally {
      abortRef.current = null;
      setGenerating(false);
    }
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  const hasContent = !!(citationSummary || entityTagsRaw.trim());
  const tagPreview = entityTagsRaw.split("\n").map((l) => l.trim()).filter(Boolean);

  return (
    <div className="song-visibility__section song-visibility__section--about">
      <button
        type="button"
        className="song-visibility__section-header"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="song-visibility__section-arrow">{expanded ? "▾" : "▸"}</span>
        <span className="song-visibility__section-label">About / Topics &amp; themes</span>
        <span className={`song-visibility__section-badge song-visibility__section-badge--${hasContent ? "published" : "empty"}`}>
          {hasContent ? `${tagPreview.length} tag${tagPreview.length === 1 ? "" : "s"}` : "empty"}
        </span>
        {saveStatus === "saving" && (
          <span style={{ color: "var(--text-tertiary)", fontSize: "0.7rem", marginLeft: "auto" }}>Saving...</span>
        )}
      </button>

      {expanded && (
        <div className="song-visibility__section-body">
          {loading ? (
            <p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)", fontSize: "0.8rem" }}>Loading...</p>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
                <button
                  type="button"
                  className={generating ? "admin-btn admin-btn--danger" : "admin-btn"}
                  onClick={generating ? handleStop : handleGenerate}
                  style={{ fontSize: "0.7rem", padding: "0.2rem 0.5rem" }}
                >
                  {generating ? "Stop" : hasContent ? "Regenerate" : "Generate"}
                </button>
                <span style={{ fontFamily: "var(--font-ui)", fontSize: "0.7rem", color: "var(--text-tertiary)" }}>
                  Drives the public &ldquo;About / Topics &amp; themes&rdquo; panel
                </span>
              </div>

              <div style={fieldLabelFirst}>Citation Summary</div>
              <textarea
                value={citationSummary}
                onChange={(e) => setCitationSummary(e.target.value)}
                className="obsv-editor__textarea"
                rows={4}
                style={{ fontFamily: "var(--font-ui)", fontSize: "0.85rem" }}
                placeholder="30-45 word standalone summary of the album. Lifted verbatim by AI engines."
              />

              <div style={fieldLabel}>Entity Tags (one per line)</div>
              <textarea
                value={entityTagsRaw}
                onChange={(e) => setEntityTagsRaw(e.target.value)}
                className="obsv-editor__textarea"
                rows={4}
                style={{ fontFamily: "var(--font-ui)", fontSize: "0.85rem" }}
                placeholder={"synth-pop\npost-divorce\nGulf Coast night drive"}
              />
              {tagPreview.length > 0 && (
                <ul className="song-visibility__tag-preview">
                  {tagPreview.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
