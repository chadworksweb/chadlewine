"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAutosave } from "@/hooks/useAutosave";

interface SongAboutShape {
  id: string;
  citation_summary: string | null;
  entity_tags: string[] | null;
  chad_quote: string | null;
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

export function AboutSectionEditor({ songId }: { songId: string }) {
  const [song, setSong] = useState<SongAboutShape | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [generating, setGenerating] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Local form state — autosaves back to /api/admin/songs/[id]
  const [citationSummary, setCitationSummary] = useState("");
  const [entityTagsRaw, setEntityTagsRaw] = useState("");
  const [chadQuote, setChadQuote] = useState("");

  const fetchSong = useCallback(async () => {
    const res = await fetch(`/api/admin/songs/${encodeURIComponent(songId)}`);
    if (!res.ok) {
      setLoading(false);
      return;
    }
    const data = (await res.json()) as SongAboutShape;
    setSong(data);
    setCitationSummary(data.citation_summary || "");
    setEntityTagsRaw((data.entity_tags || []).join("\n"));
    setChadQuote(data.chad_quote || "");
    setLoading(false);
  }, [songId]);

  useEffect(() => {
    fetchSong();
  }, [fetchSong]);

  const buildPayload = useCallback(
    () => ({
      citation_summary: citationSummary || null,
      entity_tags: entityTagsRaw.split("\n").map((l) => l.trim()).filter(Boolean),
      chad_quote: chadQuote || null,
    }),
    [citationSummary, entityTagsRaw, chadQuote],
  );

  const { status: saveStatus } = useAutosave({
    data: { citationSummary, entityTagsRaw, chadQuote },
    endpoint: "/api/admin/songs",
    id: song?.id,
    buildPayload,
    enabled: !!song?.id,
  });

  async function handleGenerate() {
    if (!song?.id) return;
    setGenerating(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch("/api/admin/song-visibility-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ song_id: song.id, geoOnly: true }),
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
      // Server already wrote to the songs row — refetch to pick up the new values.
      await fetchSong();
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

  const hasContent = !!(citationSummary || entityTagsRaw.trim() || chadQuote);
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
                  Drives the public &ldquo;What is &lsquo;{song?.id ? "" : ""}&rsquo; about?&rdquo; panel
                </span>
              </div>

              <div style={fieldLabelFirst}>Citation Summary</div>
              <textarea
                value={citationSummary}
                onChange={(e) => setCitationSummary(e.target.value)}
                className="obsv-editor__textarea"
                rows={4}
                style={{ fontFamily: "var(--font-ui)", fontSize: "0.85rem" }}
                placeholder="40-60 word standalone summary of the song. Lifted verbatim by AI engines."
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

              <div style={fieldLabel}>Chad Quote</div>
              <textarea
                value={chadQuote}
                onChange={(e) => setChadQuote(e.target.value)}
                className="obsv-editor__textarea"
                rows={3}
                style={{ fontFamily: "var(--font-ui)", fontSize: "0.85rem" }}
                placeholder="A quote from Chad that anchors the panel. Manual — not generated."
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
