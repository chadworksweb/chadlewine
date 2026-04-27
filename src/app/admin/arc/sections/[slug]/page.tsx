"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";

type Section = {
  id: string;
  slug: string;
  title: string;
  content_md: string;
  content_html: string;
  status: "draft" | "published";
  is_stale: boolean;
  stale_reasons: StaleReason[] | null;
  last_published_at: string | null;
  scope_kind: string;
  date_start: string | null;
  date_end: string | null;
};

type StaleReason = {
  kind: string;
  entity_id: string;
  entity_slug: string | null;
  entity_title: string | null;
  action: string;
  at: string;
};

type Dependency = { entity_kind: string; entity_id: string; added_at: string };
type Revision = { id: string; revision_number: number; created_at: string };

export default function SectionDetailPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = use(props.params);
  const [section, setSection] = useState<Section | null>(null);
  const [deps, setDeps] = useState<Dependency[]>([]);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [contentMd, setContentMd] = useState("");
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; message: string } | null>(null);

  useEffect(() => { load(); }, [slug]);

  async function load() {
    const res = await fetch(`/api/admin/arc/sections/${slug}`);
    if (!res.ok) return;
    const d = await res.json();
    setSection(d.section);
    setDeps(d.dependencies);
    setRevisions(d.revisions);
    setContentMd(d.section.content_md ?? "");
  }

  async function saveDraft() {
    setSaving(true);
    setToast(null);
    const res = await fetch(`/api/admin/arc/sections/${slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content_md: contentMd }),
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json();
      setToast({ kind: "err", message: d.error ?? "Save failed" });
    } else {
      setToast({ kind: "ok", message: "Draft saved." });
      load();
    }
  }

  async function publish() {
    setPublishing(true);
    setShowPublishConfirm(false);
    setToast(null);
    // Save first to ensure latest md is published
    await fetch(`/api/admin/arc/sections/${slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content_md: contentMd }),
    });
    const res = await fetch(`/api/admin/arc/sections/${slug}/publish`, { method: "POST" });
    setPublishing(false);
    if (!res.ok) {
      const d = await res.json();
      setToast({ kind: "err", message: d.error ?? "Publish failed" });
    } else {
      const d = await res.json();
      setToast({ kind: "ok", message: `Published. Revision #${d.revision_number}.` });
      load();
    }
  }

  async function restoreRevision(revisionId: number, revisionNumber: number) {
    if (!confirm(`Restore revision #${revisionNumber} as current draft? Current content will be archived as a new revision.`)) return;
    const res = await fetch(`/api/admin/arc/sections/${slug}/revisions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revision_id: revisionId }),
    });
    if (!res.ok) {
      const d = await res.json();
      setToast({ kind: "err", message: d.error ?? "Restore failed" });
    } else {
      const d = await res.json();
      setToast({ kind: "ok", message: `Restored from revision #${d.restored_from}. Now in draft.` });
      load();
    }
  }

  if (!section) return <div className="admin-page"><p style={{ color: "var(--text-tertiary)" }}>Loading…</p></div>;

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <div>
          <h1 className="admin-page__title">{section.title}</h1>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 4, fontFamily: "var(--font-ui)", fontSize: "0.8rem", color: "var(--text-tertiary)" }}>
            <span>slug: {section.slug}</span>
            <span>scope: {section.scope_kind}{section.date_start ? ` · ${section.date_start.slice(0,4)}–${section.date_end?.slice(0,4) ?? "present"}` : ""}</span>
            <span className={`admin-status admin-status--${section.status}`}>{section.status}</span>
            {section.is_stale && <span style={{ color: "#ffbb33" }}>● stale</span>}
            {section.last_published_at && <span>last pub {new Date(section.last_published_at).toLocaleDateString()}</span>}
          </div>
        </div>
        <Link href="/admin/arc/sections" className="admin-btn admin-btn--secondary">← Sections</Link>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", gap: "var(--space-xl)" }}>
        {/* Editor */}
        <div>
          <textarea
            className="obsv-editor__input"
            value={contentMd}
            onChange={(e) => setContentMd(e.target.value)}
            rows={30}
            style={{ width: "100%", fontFamily: "var(--font-mono, monospace)", fontSize: "0.85rem", lineHeight: 1.5 }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: "var(--space-md)" }}>
            <button onClick={saveDraft} disabled={saving || publishing} className="admin-btn admin-btn--secondary">
              {saving ? "Saving…" : "Save Draft"}
            </button>
            <button onClick={() => setShowPublishConfirm(true)} disabled={saving || publishing} className="admin-btn admin-btn--primary">
              {publishing ? "Publishing…" : "Publish to Site"}
            </button>
          </div>

          {toast && (
            <div style={{
              marginTop: "var(--space-md)",
              padding: "var(--space-sm) var(--space-md)",
              borderRadius: 6,
              border: `1px solid ${toast.kind === "ok" ? "#33cc55" : "#ff3333"}`,
              color: toast.kind === "ok" ? "#33cc55" : "#ff3333",
              background: "rgba(0,0,0,0.05)",
              fontFamily: "var(--font-ui)",
              fontSize: "0.85rem",
            }}>
              {toast.message}
            </div>
          )}
        </div>

        {/* Side panel: stale reasons + revisions */}
        <div style={{ display: "grid", gap: "var(--space-lg)", alignContent: "start" }}>
          <SidePanel title={`Stale reasons (${section.stale_reasons?.length ?? 0})`}>
            {!section.stale_reasons || section.stale_reasons.length === 0 ? (
              <p style={{ color: "var(--text-tertiary)", fontSize: "0.85rem" }}>None — section is in sync with its scope.</p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
                {section.stale_reasons.slice(0, 20).map((r, i) => (
                  <li key={i} style={{ fontSize: "0.8rem", fontFamily: "var(--font-ui)", lineHeight: 1.4 }}>
                    <span style={{ color: "#ffbb33" }}>{r.action}</span>{" "}
                    <span style={{ color: "var(--text-secondary)" }}>{r.kind}</span>{" "}
                    {r.entity_title && <span style={{ color: "var(--text-primary)" }}>"{r.entity_title}"</span>}{" "}
                    <span style={{ color: "var(--text-tertiary)", fontSize: "0.75rem" }}>{new Date(r.at).toLocaleDateString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </SidePanel>

          <SidePanel title={`Dependencies (${deps.length})`}>
            {deps.length === 0 ? (
              <p style={{ color: "var(--text-tertiary)", fontSize: "0.85rem" }}>No nodes captured in this section's scope yet.</p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 4 }}>
                {deps.slice(0, 30).map((d) => (
                  <li key={`${d.entity_kind}-${d.entity_id}`} style={{ fontSize: "0.78rem", fontFamily: "var(--font-ui)", color: "var(--text-secondary)" }}>
                    <span style={{ color: "var(--text-tertiary)" }}>{d.entity_kind}</span> · {d.entity_id.slice(0, 8)}…
                  </li>
                ))}
              </ul>
            )}
          </SidePanel>

          <SidePanel title={`Revisions (${revisions.length})`}>
            {revisions.length === 0 ? (
              <p style={{ color: "var(--text-tertiary)", fontSize: "0.85rem" }}>No revisions yet — first publish will create #1.</p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
                {revisions.slice(0, 20).map((r) => (
                  <li key={r.id} style={{ fontSize: "0.78rem", fontFamily: "var(--font-ui)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>
                      <strong>#{r.revision_number}</strong>{" "}
                      <span style={{ color: "var(--text-tertiary)" }}>{new Date(r.created_at).toLocaleDateString()}</span>
                    </span>
                    <button
                      onClick={() => restoreRevision(r.id as unknown as number, r.revision_number)}
                      style={{ background: "transparent", border: "1px solid var(--text-tertiary)", color: "var(--text-secondary)", padding: "2px 8px", borderRadius: 3, fontSize: "0.7rem", cursor: "pointer" }}
                    >
                      restore
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </SidePanel>
        </div>
      </div>

      {showPublishConfirm && (
        <PublishConfirm
          slug={section.slug}
          onCancel={() => setShowPublishConfirm(false)}
          onConfirm={publish}
        />
      )}
    </div>
  );
}

function SidePanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid var(--border-subtle)", borderRadius: 6, padding: "var(--space-md)" }}>
      <h3 style={{ margin: "0 0 var(--space-sm) 0", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

function PublishConfirm({ slug, onCancel, onConfirm }: { slug: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
      display: "grid", placeItems: "center", zIndex: 1000,
    }}>
      <div style={{ background: "var(--bg-primary)", padding: "var(--space-xl)", borderRadius: 8, maxWidth: 480, border: "1px solid var(--border-subtle)" }}>
        <h2 style={{ margin: "0 0 var(--space-md) 0", fontSize: "1.1rem" }}>Publish "{slug}"?</h2>
        <p style={{ color: "var(--text-secondary)", marginBottom: "var(--space-lg)", fontSize: "0.9rem" }}>
          This will mark the section published, append a revision, clear stale flags, and stamp the last-published time.
          The public site picks up the new content on the next revalidate (within 60s) or build.
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="admin-btn admin-btn--secondary" onClick={onCancel}>Cancel</button>
          <button className="admin-btn admin-btn--primary" onClick={onConfirm}>Publish</button>
        </div>
      </div>
    </div>
  );
}
