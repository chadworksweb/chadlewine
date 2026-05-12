"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type Composition = {
  id: string;
  content: string | null;
  content_html: string | null;
  status: "draft" | "published";
  updated_at: string;
};

type Revision = {
  id: string;
  revision_number: number;
  content: string | null;
  content_html: string | null;
  created_at: string;
};

export default function ArtCompositionPage() {
  const { slug } = useParams() as { slug: string };
  const [composition, setComposition] = useState<Composition | null>(null);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [content, setContent] = useState("");
  const [initialContent, setInitialContent] = useState("");
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewingRevision, setViewingRevision] = useState<Revision | null>(null);
  const [showRevisions, setShowRevisions] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/admin/art/${slug}/composition`);
    if (!res.ok) {
      setError("Failed to load composition");
      setLoading(false);
      return;
    }
    const data = await res.json();
    setComposition(data.composition);
    setRevisions(data.revisions || []);
    const c = data.composition?.content ?? "";
    setContent(c);
    setInitialContent(c);
    setLoading(false);
  }

  useEffect(() => { load(); }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = content !== initialContent;

  async function save(newStatus?: "draft" | "published") {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/admin/art/${slug}/composition`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content,
        status: newStatus ?? composition?.status ?? "draft",
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Save failed");
      return;
    }
    await load();
  }

  async function togglePublish() {
    if (!composition) {
      await save("published");
      return;
    }
    const next = composition.status === "published" ? "draft" : "published";
    await save(next);
  }

  async function restoreRevision(revisionId: string) {
    if (!confirm("Restore this revision? Current content will be archived.")) return;
    const res = await fetch(`/api/admin/art/${slug}/composition/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revision_id: revisionId }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Restore failed");
      return;
    }
    setViewingRevision(null);
    await load();
  }

  if (loading) return <div className="admin-page"><p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>Loading…</p></div>;

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">Composition</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <Link className="admin-btn" href={`/admin/art/${slug}`}>Back to editor</Link>
          <a className="admin-btn" href={`/art/${slug}`} target="_blank" rel="noreferrer">View</a>
          <button className="admin-btn" onClick={togglePublish} disabled={saving}>
            {composition?.status === "published" ? "Unpublish" : "Publish"}
          </button>
          <button className="admin-btn admin-btn--primary" onClick={() => save()} disabled={saving || !dirty}>
            {saving ? "Saving…" : dirty ? "Save" : "Saved"}
          </button>
        </div>
      </div>

      {error && <p style={{ color: "var(--error, #ff6b6b)", fontFamily: "var(--font-ui)", marginBottom: "var(--space-md)" }}>{error}</p>}

      <div style={{ display: "flex", gap: 4, marginBottom: "var(--space-sm)" }}>
        <button
          type="button"
          className={`admin-btn admin-btn--small${mode === "edit" ? " admin-btn--primary" : ""}`}
          onClick={() => setMode("edit")}
        >
          Markdown
        </button>
        <button
          type="button"
          className={`admin-btn admin-btn--small${mode === "preview" ? " admin-btn--primary" : ""}`}
          onClick={() => setMode("preview")}
        >
          Preview
        </button>
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: "var(--font-ui)", fontSize: "0.7rem", color: "var(--text-tertiary)", alignSelf: "center" }}>
          Status: <strong>{composition?.status ?? "unsaved"}</strong>
          {composition?.updated_at && ` · Last saved ${new Date(composition.updated_at).toLocaleString()}`}
        </span>
      </div>

      {mode === "edit" ? (
        <textarea
          className="obsv-editor__input"
          style={{ minHeight: 540, fontFamily: "var(--font-mono, monospace)", whiteSpace: "pre-wrap" }}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Write the making-of. Markdown supported. Each save archives the prior version as a revision."
        />
      ) : (
        <div className="prose" style={{ border: "1px solid var(--border-subtle, #2a2a35)", borderRadius: 6, padding: "var(--space-md)", minHeight: 540 }}>
          {content.trim() ? (
            <div dangerouslySetInnerHTML={{ __html: composition?.content_html || "" }} />
          ) : (
            <p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>Nothing to preview yet.</p>
          )}
        </div>
      )}

      {revisions.length > 0 && (
        <div style={{ marginTop: "var(--space-lg)" }}>
          <button
            type="button"
            onClick={() => setShowRevisions((v) => !v)}
            style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-ui)", fontSize: "0.75rem", color: "var(--text-tertiary)", padding: 0 }}
          >
            {showRevisions ? "▾" : "▸"} {revisions.length} revision{revisions.length === 1 ? "" : "s"}
          </button>

          {showRevisions && (
            <div style={{ marginTop: "var(--space-sm)", display: "flex", flexDirection: "column", gap: 4 }}>
              {revisions.map((rev) => (
                <button
                  key={rev.id}
                  type="button"
                  onClick={() => setViewingRevision(rev)}
                  style={{
                    background: viewingRevision?.id === rev.id ? "rgba(139, 156, 247, 0.1)" : "none",
                    border: "1px solid var(--border-subtle, #2a2a35)",
                    borderRadius: 4,
                    padding: "6px 10px",
                    cursor: "pointer",
                    textAlign: "left",
                    fontFamily: "var(--font-ui)",
                    fontSize: "0.75rem",
                    color: "var(--text-secondary)",
                  }}
                >
                  Rev #{rev.revision_number} — {new Date(rev.created_at).toLocaleString()}
                </button>
              ))}
            </div>
          )}

          {viewingRevision && (
            <div style={{ marginTop: "var(--space-sm)", border: "1px solid #ffbb33", borderRadius: 6, padding: "var(--space-md)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-sm)" }}>
                <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "0.75rem", color: "#ffbb33" }}>
                  Viewing Revision #{viewingRevision.revision_number}
                </span>
                <div style={{ display: "flex", gap: 4 }}>
                  <button className="admin-btn admin-btn--small" onClick={() => restoreRevision(viewingRevision.id)}>Restore</button>
                  <button className="admin-btn admin-btn--small" onClick={() => setViewingRevision(null)}>Close</button>
                </div>
              </div>
              <div
                className="prose"
                style={{ maxHeight: 400, overflowY: "auto" }}
                dangerouslySetInnerHTML={{ __html: viewingRevision.content_html || "" }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
