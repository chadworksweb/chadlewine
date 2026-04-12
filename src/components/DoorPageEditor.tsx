"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { slugify } from "@/lib/utils";
import { RichTextEditor } from "@/components/RichTextEditor";
import { GeoPanel } from "@/components/GeoPanel";

interface DoorPageData {
  id?: string;
  title: string;
  slug: string;
  body: string;
  meta_title: string;
  meta_description: string;
  target_queries: string[];
  funnel_targets: string[];
  og_image_path: string;
  og_alt: string;
  status: string;
  // GEO fields
  seo_title: string;
  seo_description: string;
  focus_keyphrase: string;
  secondary_keyphrases: string[];
  search_intent: string;
  citation_summary: string;
  first_sentence_extractable: boolean;
  paa_pairs: { question: string; answer: string }[];
  entity_tags: string[];
  article_type: string;
  hook_line: string;
  tension_line: string;
  published_at: string | null;
}

const EMPTY: DoorPageData = {
  title: "",
  slug: "",
  body: "",
  meta_title: "",
  meta_description: "",
  target_queries: [],
  funnel_targets: [],
  og_image_path: "",
  og_alt: "",
  status: "draft",
  seo_title: "",
  seo_description: "",
  focus_keyphrase: "",
  secondary_keyphrases: [],
  search_intent: "informational",
  citation_summary: "",
  first_sentence_extractable: false,
  paa_pairs: [],
  entity_tags: [],
  article_type: "article",
  hook_line: "",
  tension_line: "",
  published_at: null,
};

export function DoorPageEditor({ initial }: { initial?: DoorPageData }) {
  const router = useRouter();
  const isEdit = !!initial?.id;
  const [form, setForm] = useState<DoorPageData>(initial || EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [queryInput, setQueryInput] = useState("");
  const [funnelInput, setFunnelInput] = useState("");

  function set<K extends keyof DoorPageData>(key: K, value: DoorPageData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (!form.title.trim()) {
      setError("Title is required");
      return;
    }
    setSaving(true);
    setError("");

    const payload = {
      ...form,
      slug: form.slug || slugify(form.title),
    };

    const url = isEdit
      ? `/api/admin/door-pages/${form.id}`
      : "/api/admin/door-pages";
    const method = isEdit ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Save failed");
      setSaving(false);
      return;
    }

    const saved = await res.json();
    setSaving(false);

    if (!isEdit) {
      router.push(`/admin/door-pages/${saved.id}`);
    }
  }

  async function handleDelete() {
    if (!isEdit) return;
    if (!confirm("Delete this door page?")) return;
    await fetch(`/api/admin/door-pages/${form.id}`, { method: "DELETE" });
    router.push("/admin/door-pages");
  }

  function addQuery() {
    const q = queryInput.trim();
    if (q && !form.target_queries.includes(q)) {
      set("target_queries", [...form.target_queries, q]);
    }
    setQueryInput("");
  }

  function removeQuery(idx: number) {
    set("target_queries", form.target_queries.filter((_, i) => i !== idx));
  }

  function addFunnel() {
    const f = funnelInput.trim();
    if (f && !form.funnel_targets.includes(f)) {
      set("funnel_targets", [...form.funnel_targets, f]);
    }
    setFunnelInput("");
  }

  function removeFunnel(idx: number) {
    set("funnel_targets", form.funnel_targets.filter((_, i) => i !== idx));
  }

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">{isEdit ? "Edit Door Page" : "New Door Page"}</h1>
        <div style={{ display: "flex", gap: 8 }}>
          {isEdit && (
            <button type="button" className="admin-btn admin-btn--danger" onClick={handleDelete}>
              Delete
            </button>
          )}
          <button
            type="button"
            className="admin-btn admin-btn--primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {error && <p className="obsv-editor__error">{error}</p>}

      {/* Title + Slug */}
      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Title</label>
        <input
          className="obsv-editor__input"
          value={form.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder="Door page title"
        />
      </div>

      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Slug</label>
        <input
          className="obsv-editor__input"
          value={form.slug}
          onChange={(e) => set("slug", e.target.value)}
          placeholder={form.title ? slugify(form.title) : "auto-generated"}
        />
      </div>

      {/* Status */}
      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Status</label>
        <select
          className="obsv-editor__input"
          value={form.status}
          onChange={(e) => set("status", e.target.value)}
        >
          <option value="draft">Draft</option>
          <option value="published">Published</option>
        </select>
      </div>

      {/* Body */}
      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Body</label>
        <RichTextEditor
          value={form.body}
          onChange={(val) => set("body", val)}
        />
      </div>

      {/* Target Queries */}
      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Target Queries</label>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input
            className="obsv-editor__input"
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            placeholder="Add a target query..."
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addQuery())}
            style={{ flex: 1 }}
          />
          <button type="button" className="admin-btn" onClick={addQuery}>Add</button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {form.target_queries.map((q, i) => (
            <span key={i} className="admin-meta-chip" style={{ cursor: "pointer" }} onClick={() => removeQuery(i)}>
              {q} &times;
            </span>
          ))}
        </div>
      </div>

      {/* Funnel Targets */}
      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Funnel Targets (paths)</label>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input
            className="obsv-editor__input"
            value={funnelInput}
            onChange={(e) => setFunnelInput(e.target.value)}
            placeholder="/observations/the-razor"
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addFunnel())}
            style={{ flex: 1 }}
          />
          <button type="button" className="admin-btn" onClick={addFunnel}>Add</button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {form.funnel_targets.map((f, i) => (
            <span key={i} className="admin-meta-chip" style={{ cursor: "pointer" }} onClick={() => removeFunnel(i)}>
              {f} &times;
            </span>
          ))}
        </div>
      </div>

      <GeoPanel
        body={form.body}
        focusKeyphrase={form.focus_keyphrase}
        secondaryKeyphrases={form.secondary_keyphrases}
        searchIntent={form.search_intent}
        citationSummary={form.citation_summary}
        firstSentenceExtractable={form.first_sentence_extractable}
        paaPairs={form.paa_pairs}
        entityTags={form.entity_tags}
        articleType={form.article_type}
        artImagePath={form.og_image_path}
        artAlt={form.og_alt}
        dateCaptured={form.published_at || ""}
        publishedAt={form.published_at}
        hookLine={form.hook_line}
        tensionLine={form.tension_line}
        seoTitle={form.seo_title || form.meta_title}
        seoDescription={form.seo_description || form.meta_description}
        onChange={(field, value) => set(field as keyof DoorPageData, value as never)}
        contentType="door-page"
      />
    </div>
  );
}
