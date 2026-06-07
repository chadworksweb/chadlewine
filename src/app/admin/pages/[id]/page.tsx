"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAutosave } from "@/hooks/useAutosave";
import { SeoFieldsPanel } from "@/components/SeoFieldsPanel";

interface PageRecord {
  id: string;
  slug: string;
  parent_id: string | null;
  title: string;
  template: string;
  status: "draft" | "published";
  seo_title: string | null;
  seo_description: string | null;
  og_image_path: string | null;
  sort_order: number;
}

interface Section {
  id: string;
  type: string;
  position: number;
  heading: string | null;
  body: string | null;
  data: Record<string, unknown>;
  status: "open" | "filled" | null;
}

const SECTION_TYPES = ["hero", "prose", "research", "track-grid", "favorites", "faq", "prompt"];

export default function EditPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const [page, setPage] = useState<PageRecord | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [allPages, setAllPages] = useState<{ id: string; title: string; slug: string }[]>([]);

  useEffect(() => {
    fetch(`/api/admin/pages/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.page) {
          setPage(d.page);
          setSections((d.sections || []).sort((a: Section, b: Section) => a.position - b.position));
        }
      });
    fetch("/api/admin/pages")
      .then((r) => r.json())
      .then((d) => setAllPages(Array.isArray(d) ? d : []));
  }, [id]);

  const set = useCallback(<K extends keyof PageRecord>(field: K, value: PageRecord[K]) => {
    setPage((prev) => (prev ? { ...prev, [field]: value } : prev));
  }, []);

  const buildPayload = useCallback(
    (d: PageRecord) => ({
      slug: d.slug,
      title: d.title,
      parent_id: d.parent_id,
      template: d.template,
      status: d.status,
      seo_title: d.seo_title,
      seo_description: d.seo_description,
      og_image_path: d.og_image_path,
      sort_order: d.sort_order,
    }),
    [],
  );

  const { status: autosaveStatus } = useAutosave({
    data: page || ({} as PageRecord),
    endpoint: "/api/admin/pages",
    id,
    buildPayload,
    enabled: !!page && !!page.title,
  });

  // --- section operations ---
  async function patchSection(sectionId: string, patch: Partial<Section>) {
    const res = await fetch(`/api/admin/pages/${id}/sections/${sectionId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const updated = await res.json();
      setSections((prev) => prev.map((s) => (s.id === sectionId ? updated : s)));
    } else {
      const e = await res.json().catch(() => ({}));
      alert(e?.error || "Save failed");
    }
  }

  async function deleteSection(sectionId: string) {
    if (!confirm("Delete this section?")) return;
    const res = await fetch(`/api/admin/pages/${id}/sections/${sectionId}`, { method: "DELETE" });
    if (res.ok) setSections((prev) => prev.filter((s) => s.id !== sectionId));
  }

  async function addSection(type: string) {
    const res = await fetch(`/api/admin/pages/${id}/sections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, status: type === "prompt" ? "open" : null }),
    });
    if (res.ok) {
      const created = await res.json();
      setSections((prev) => [...prev, created]);
    }
  }

  async function move(index: number, dir: -1 | 1) {
    const next = index + dir;
    if (next < 0 || next >= sections.length) return;
    const reordered = [...sections];
    [reordered[index], reordered[next]] = [reordered[next], reordered[index]];
    const withPos = reordered.map((s, i) => ({ ...s, position: i * 10 }));
    setSections(withPos);
    await fetch(`/api/admin/pages/${id}/sections`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: withPos.map((s) => ({ id: s.id, position: s.position })) }),
    });
  }

  async function handleDelete() {
    if (!confirm("Delete this page and all its sections?")) return;
    await fetch(`/api/admin/pages/${id}`, { method: "DELETE" });
    router.push("/admin/pages");
  }

  if (!page) {
    return (
      <div className="admin-page">
        <p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>Loading...</p>
      </div>
    );
  }

  const isManaged = page.template === "managed";
  const openPrompts = sections.filter((s) => s.type === "prompt" && s.status === "open").length;

  return (
    <div className="obsv-editor">
      <div className="obsv-editor__header">
        <h1 className="admin-page__title">Edit Page</h1>
        <div className="obsv-editor__actions">
          <Link href="/admin/pages" className="admin-btn admin-btn--secondary">All Pages</Link>
          {page.status === "published" && !isManaged && (
            <Link href={`/${page.slug}`} className="admin-btn admin-btn--secondary" target="_blank">View</Link>
          )}
          <button className="admin-btn admin-btn--danger" onClick={handleDelete} type="button">Delete</button>
          <span className={`autosave-status autosave-status--${autosaveStatus}`}>
            {autosaveStatus === "saving" && "Saving..."}
            {autosaveStatus === "saved" && "Saved"}
            {autosaveStatus === "error" && "Save failed"}
          </span>
        </div>
      </div>

      <div className="obsv-editor__grid">
        {/* Main column */}
        <div className="obsv-editor__main">
          <div className="obsv-editor__field">
            <label className="obsv-editor__label" htmlFor="title">Title</label>
            <input id="title" className="obsv-editor__input" type="text" value={page.title}
              onChange={(e) => set("title", e.target.value)} />
          </div>

          <div className="obsv-editor__field">
            <label className="obsv-editor__label" htmlFor="slug">Slug (full path)</label>
            <input id="slug" className="obsv-editor__input obsv-editor__input--mono" type="text" value={page.slug}
              onChange={(e) => set("slug", e.target.value)} />
          </div>

          {/* Search Appearance (canonical seo_title / seo_description) */}
          <div style={{ marginTop: "1.5rem" }}>
            <SeoFieldsPanel
              seoTitle={page.seo_title || ""}
              seoDescription={page.seo_description || ""}
              defaultTitle={`${page.title || "Untitled"} - Chad Lewine`}
              descriptionFallbackHint="the page's own default description"
              urlBreadcrumb={page.slug}
              onChange={(field, value) => set(field, (value || null) as PageRecord[typeof field])}
            />
          </div>

          {/* Sections */}
          <div style={{ marginTop: "1.75rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
              <h2 style={{ fontFamily: "var(--font-ui)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-tertiary)", margin: 0 }}>
                Sections {openPrompts > 0 && <span className="admin-badge admin-badge--warn" style={{ marginLeft: 8 }}>{openPrompts} open prompts</span>}
              </h2>
              <AddSection onAdd={addSection} />
            </div>

            {isManaged && (
              <p style={{ fontSize: "0.8rem", color: "#a16207", marginTop: 0 }}>
                This page renders from its route file (code), not from these sections. Sections here
                are for tracking only; SEO above saves to the legacy override and takes effect live.
              </p>
            )}

            <div className="page-sections">
              {sections.map((s, i) => (
                <SectionCard
                  key={s.id}
                  section={s}
                  isFirst={i === 0}
                  isLast={i === sections.length - 1}
                  onMoveUp={() => move(i, -1)}
                  onMoveDown={() => move(i, 1)}
                  onPatch={(patch) => patchSection(s.id, patch)}
                  onDelete={() => deleteSection(s.id)}
                />
              ))}
              {sections.length === 0 && (
                <p style={{ color: "#bbb", fontSize: "0.85rem" }}>No sections yet. Add one above.</p>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="obsv-editor__sidebar">
          <div className="obsv-editor__panel">
            <h3 className="obsv-editor__panel-title">Publish</h3>
            <div className="obsv-editor__field">
              <label className="obsv-editor__label" htmlFor="status">Status</label>
              <select id="status" className="obsv-editor__input" value={page.status}
                onChange={(e) => set("status", e.target.value as PageRecord["status"])}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </div>
            <div className="obsv-editor__field">
              <label className="obsv-editor__label" htmlFor="template">Template</label>
              <select id="template" className="obsv-editor__input" value={page.template}
                onChange={(e) => set("template", e.target.value)}>
                <option value="standard">standard (DB-rendered)</option>
                <option value="managed">managed (code-rendered)</option>
              </select>
            </div>
          </div>

          <div className="obsv-editor__panel">
            <h3 className="obsv-editor__panel-title">Hierarchy</h3>
            <div className="obsv-editor__field">
              <label className="obsv-editor__label" htmlFor="parent">Parent page</label>
              <select id="parent" className="obsv-editor__input" value={page.parent_id || ""}
                onChange={(e) => set("parent_id", e.target.value || null)}>
                <option value="">(none)</option>
                {allPages.filter((p) => p.id !== page.id).map((p) => (
                  <option key={p.id} value={p.id}>{p.title} (/{p.slug})</option>
                ))}
              </select>
            </div>
            <div className="obsv-editor__field">
              <label className="obsv-editor__label" htmlFor="sort_order">Sort order</label>
              <input id="sort_order" className="obsv-editor__input" type="number" value={page.sort_order}
                onChange={(e) => set("sort_order", Number(e.target.value) || 0)} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AddSection({ onAdd }: { onAdd: (type: string) => void }) {
  const [type, setType] = useState("prose");
  return (
    <div style={{ display: "flex", gap: "0.4rem" }}>
      <select className="obsv-editor__input" style={{ width: "auto" }} value={type} onChange={(e) => setType(e.target.value)}>
        {SECTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      <button className="admin-btn admin-btn--secondary" type="button" onClick={() => onAdd(type)}>+ Add</button>
    </div>
  );
}

function SectionCard({
  section, isFirst, isLast, onMoveUp, onMoveDown, onPatch, onDelete,
}: {
  section: Section;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onPatch: (patch: Partial<Section>) => void;
  onDelete: () => void;
}) {
  const isPrompt = section.type === "prompt";
  const [heading, setHeading] = useState(section.heading || "");
  const [body, setBody] = useState(section.body || "");
  const [dataText, setDataText] = useState(JSON.stringify(section.data ?? {}, null, 2));
  const [dataErr, setDataErr] = useState<string | null>(null);

  function saveContent() {
    let parsed: Record<string, unknown> = section.data ?? {};
    if (!isPrompt) {
      try {
        parsed = JSON.parse(dataText);
        setDataErr(null);
      } catch {
        setDataErr("Invalid JSON in data");
        return;
      }
    }
    const patch: Partial<Section> = { heading: heading || null, body: body || null };
    if (!isPrompt) patch.data = parsed;
    onPatch(patch);
  }

  return (
    <div className={`page-section-card${isPrompt ? " page-section-card--prompt" : ""}`}>
      <div className="page-section-card__head">
        <span className="page-section-card__type">
          {section.type}
          {isPrompt && (
            <span className={`admin-badge ${section.status === "open" ? "admin-badge--warn" : "admin-badge--muted"}`} style={{ marginLeft: 8 }}>
              {section.status || "open"}
            </span>
          )}
        </span>
        <div className="page-section-card__actions">
          {isPrompt && (
            <button className="page-section-card__iconbtn" type="button"
              onClick={() => onPatch({ status: section.status === "filled" ? "open" : "filled" })}>
              {section.status === "filled" ? "Reopen" : "Mark filled"}
            </button>
          )}
          <button className="page-section-card__iconbtn" type="button" onClick={onMoveUp} disabled={isFirst}>up</button>
          <button className="page-section-card__iconbtn" type="button" onClick={onMoveDown} disabled={isLast}>down</button>
          <button className="page-section-card__iconbtn" type="button" onClick={onDelete}>del</button>
        </div>
      </div>

      {!isPrompt && (
        <div className="obsv-editor__field" style={{ marginTop: "0.5rem" }}>
          <input className="obsv-editor__input" type="text" placeholder="Heading / banner label"
            value={heading} onChange={(e) => setHeading(e.target.value)} />
        </div>
      )}

      <div className="obsv-editor__field">
        <textarea className="obsv-editor__input" rows={isPrompt ? 3 : 4}
          placeholder={isPrompt ? "The WRITE instruction (open), or the written copy (filled)" : "Body (HTML for prose/research)"}
          value={body} onChange={(e) => setBody(e.target.value)} />
      </div>

      {!isPrompt && (
        <details>
          <summary style={{ fontSize: "0.72rem", color: "var(--text-tertiary)", cursor: "pointer", fontFamily: "var(--font-ui)" }}>
            data (JSON)
          </summary>
          <textarea className="obsv-editor__input obsv-editor__input--mono" rows={6} value={dataText}
            onChange={(e) => setDataText(e.target.value)} />
          {dataErr && <span style={{ color: "#dc2626", fontSize: "0.75rem" }}>{dataErr}</span>}
        </details>
      )}

      <button className="admin-btn admin-btn--secondary" type="button" style={{ marginTop: "0.5rem" }} onClick={saveContent}>
        Save section
      </button>
    </div>
  );
}
