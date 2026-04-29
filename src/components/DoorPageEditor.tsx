"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { slugify } from "@/lib/utils";
import { RichTextEditor } from "@/components/RichTextEditor";
import { GeoPanel } from "@/components/GeoPanel";

interface SongRow {
  id: string;
  title: string;
  slug: string;
  status: string;
  art_image_path: string | null;
}

interface ArtRow {
  id: string;
  title: string;
  slug: string;
  status: string;
  image_path: string | null;
}

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
  const [allSongs, setAllSongs] = useState<SongRow[]>([]);
  const [linkedSongIds, setLinkedSongIds] = useState<string[]>([]);
  const [songSearch, setSongSearch] = useState("");
  const [songsDirty, setSongsDirty] = useState(false);
  const [allArt, setAllArt] = useState<ArtRow[]>([]);
  const [linkedArtIds, setLinkedArtIds] = useState<string[]>([]);
  const [artSearch, setArtSearch] = useState("");
  const [artDirty, setArtDirty] = useState(false);

  useEffect(() => {
    fetch("/api/admin/songs")
      .then((r) => r.json())
      .then((data) => setAllSongs(Array.isArray(data) ? data : []))
      .catch(() => setAllSongs([]));

    fetch("/api/admin/art")
      .then((r) => r.json())
      .then((data) => setAllArt(Array.isArray(data) ? data : []))
      .catch(() => setAllArt([]));

    if (isEdit && initial?.id) {
      fetch(`/api/admin/door-pages/${initial.id}/songs`)
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data)) setLinkedSongIds(data.map((s: SongRow) => s.id));
        })
        .catch(() => {});

      fetch(`/api/admin/door-pages/${initial.id}/art`)
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data)) setLinkedArtIds(data.map((a: ArtRow) => a.id));
        })
        .catch(() => {});
    }
  }, [isEdit, initial?.id]);

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

    const doorId = saved.id;
    if (doorId && songsDirty) {
      await fetch(`/api/admin/door-pages/${doorId}/songs`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ song_ids: linkedSongIds }),
      });
      setSongsDirty(false);
    }

    if (doorId && artDirty) {
      await fetch(`/api/admin/door-pages/${doorId}/art`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ art_ids: linkedArtIds }),
      });
      setArtDirty(false);
    }

    setSaving(false);

    if (!isEdit) {
      router.push(`/admin/door-pages/${saved.slug || saved.id}`);
    }
  }

  function addSong(id: string) {
    if (linkedSongIds.includes(id)) return;
    setLinkedSongIds([...linkedSongIds, id]);
    setSongsDirty(true);
    setSongSearch("");
  }

  function removeSong(id: string) {
    setLinkedSongIds(linkedSongIds.filter((x) => x !== id));
    setSongsDirty(true);
  }

  function moveSong(id: string, dir: -1 | 1) {
    const idx = linkedSongIds.indexOf(id);
    const newIdx = idx + dir;
    if (idx < 0 || newIdx < 0 || newIdx >= linkedSongIds.length) return;
    const next = [...linkedSongIds];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    setLinkedSongIds(next);
    setSongsDirty(true);
  }

  function addArt(id: string) {
    if (linkedArtIds.includes(id)) return;
    setLinkedArtIds([...linkedArtIds, id]);
    setArtDirty(true);
    setArtSearch("");
  }

  function removeArt(id: string) {
    setLinkedArtIds(linkedArtIds.filter((x) => x !== id));
    setArtDirty(true);
  }

  function moveArt(id: string, dir: -1 | 1) {
    const idx = linkedArtIds.indexOf(id);
    const newIdx = idx + dir;
    if (idx < 0 || newIdx < 0 || newIdx >= linkedArtIds.length) return;
    const next = [...linkedArtIds];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    setLinkedArtIds(next);
    setArtDirty(true);
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

      {/* Linked Songs */}
      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Songs (funnel targets)</label>
        <p style={{ fontSize: 12, color: "#888", marginTop: 0, marginBottom: 8 }}>
          Attach songs to feature on this page. Ordered top-to-bottom.
        </p>

        {/* Ordered list of linked songs */}
        <ol style={{ listStyle: "none", padding: 0, margin: "0 0 8px", display: "flex", flexDirection: "column", gap: 4 }}>
          {linkedSongIds.map((id, idx) => {
            const s = allSongs.find((x) => x.id === id);
            if (!s) return null;
            return (
              <li
                key={id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 10px",
                  border: "1px solid #d8d8dc",
                  borderRadius: 2,
                  background: "#fff",
                  color: "#1a1a1a",
                }}
              >
                <span style={{ flex: 1, fontSize: 14 }}>
                  {idx + 1}. {s.title}{" "}
                  <span style={{ color: "#888", fontSize: 12 }}>({s.status})</span>
                </span>
                <button type="button" className="admin-btn" onClick={() => moveSong(id, -1)} disabled={idx === 0}>
                  ↑
                </button>
                <button type="button" className="admin-btn" onClick={() => moveSong(id, 1)} disabled={idx === linkedSongIds.length - 1}>
                  ↓
                </button>
                <button type="button" className="admin-btn admin-btn--danger" onClick={() => removeSong(id)}>
                  Remove
                </button>
              </li>
            );
          })}
        </ol>

        {/* Search + add */}
        <input
          className="obsv-editor__input"
          value={songSearch}
          onChange={(e) => setSongSearch(e.target.value)}
          placeholder="Search songs by title..."
        />
        {songSearch.trim() && (
          <ul style={{ listStyle: "none", padding: 0, margin: "6px 0 0", maxHeight: 200, overflowY: "auto", border: "1px solid #d8d8dc", background: "#fff" }}>
            {allSongs
              .filter(
                (s) =>
                  !linkedSongIds.includes(s.id) &&
                  s.title.toLowerCase().includes(songSearch.trim().toLowerCase())
              )
              .slice(0, 20)
              .map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => addSong(s.id)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "6px 10px",
                      background: "transparent",
                      border: "none",
                      borderBottom: "1px solid #ececf0",
                      color: "#1a1a1a",
                      cursor: "pointer",
                      fontSize: 13,
                    }}
                  >
                    {s.title} <span style={{ color: "#888" }}>({s.status})</span>
                  </button>
                </li>
              ))}
          </ul>
        )}
        {!isEdit && linkedSongIds.length > 0 && (
          <p style={{ fontSize: 11, color: "#888", marginTop: 6 }}>
            Saved on first Save.
          </p>
        )}
      </div>

      {/* Linked Art Pieces */}
      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Art pieces (funnel targets)</label>
        <p style={{ fontSize: 12, color: "#888", marginTop: 0, marginBottom: 8 }}>
          Attach art to feature on this page. Ordered top-to-bottom.
        </p>

        <ol style={{ listStyle: "none", padding: 0, margin: "0 0 8px", display: "flex", flexDirection: "column", gap: 4 }}>
          {linkedArtIds.map((id, idx) => {
            const a = allArt.find((x) => x.id === id);
            if (!a) return null;
            return (
              <li
                key={id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 10px",
                  border: "1px solid #d8d8dc",
                  borderRadius: 2,
                  background: "#fff",
                  color: "#1a1a1a",
                }}
              >
                <span style={{ flex: 1, fontSize: 14 }}>
                  {idx + 1}. {a.title}{" "}
                  <span style={{ color: "#888", fontSize: 12 }}>({a.status})</span>
                </span>
                <button type="button" className="admin-btn" onClick={() => moveArt(id, -1)} disabled={idx === 0}>
                  ↑
                </button>
                <button type="button" className="admin-btn" onClick={() => moveArt(id, 1)} disabled={idx === linkedArtIds.length - 1}>
                  ↓
                </button>
                <button type="button" className="admin-btn admin-btn--danger" onClick={() => removeArt(id)}>
                  Remove
                </button>
              </li>
            );
          })}
        </ol>

        <input
          className="obsv-editor__input"
          value={artSearch}
          onChange={(e) => setArtSearch(e.target.value)}
          placeholder="Search art by title..."
        />
        {artSearch.trim() && (
          <ul style={{ listStyle: "none", padding: 0, margin: "6px 0 0", maxHeight: 200, overflowY: "auto", border: "1px solid #d8d8dc", background: "#fff" }}>
            {allArt
              .filter(
                (a) =>
                  !linkedArtIds.includes(a.id) &&
                  a.title.toLowerCase().includes(artSearch.trim().toLowerCase())
              )
              .slice(0, 20)
              .map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => addArt(a.id)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "6px 10px",
                      background: "transparent",
                      border: "none",
                      borderBottom: "1px solid #ececf0",
                      color: "#1a1a1a",
                      cursor: "pointer",
                      fontSize: 13,
                    }}
                  >
                    {a.title} <span style={{ color: "#888" }}>({a.status})</span>
                  </button>
                </li>
              ))}
          </ul>
        )}
        {!isEdit && linkedArtIds.length > 0 && (
          <p style={{ fontSize: 11, color: "#888", marginTop: 6 }}>
            Saved on first Save.
          </p>
        )}
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
