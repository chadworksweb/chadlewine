"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { slugify } from "@/lib/utils";
import { useAutosave } from "@/hooks/useAutosave";
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

const SUB_RESOURCE_DEBOUNCE_MS = 600;

export function DoorPageEditor({ initial }: { initial?: DoorPageData }) {
  const router = useRouter();
  const isEdit = !!initial?.id;
  const [form, setForm] = useState<DoorPageData>(initial || EMPTY);
  const [queryInput, setQueryInput] = useState("");
  const [funnelInput, setFunnelInput] = useState("");
  const [allSongs, setAllSongs] = useState<SongRow[]>([]);
  const [linkedSongIds, setLinkedSongIds] = useState<string[]>([]);
  const [songSearch, setSongSearch] = useState("");
  const [allArt, setAllArt] = useState<ArtRow[]>([]);
  const [linkedArtIds, setLinkedArtIds] = useState<string[]>([]);
  const [artSearch, setArtSearch] = useState("");

  // Track last-synced JSON for sub-resources so we don't echo the initial load.
  const songsSyncedRef = useRef<string>("[]");
  const artSyncedRef = useRef<string>("[]");

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
          if (Array.isArray(data)) {
            const ids = data.map((s: SongRow) => s.id);
            songsSyncedRef.current = JSON.stringify(ids);
            setLinkedSongIds(ids);
          }
        })
        .catch(() => {});

      fetch(`/api/admin/door-pages/${initial.id}/art`)
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data)) {
            const ids = data.map((a: ArtRow) => a.id);
            artSyncedRef.current = JSON.stringify(ids);
            setLinkedArtIds(ids);
          }
        })
        .catch(() => {});
    }
  }, [isEdit, initial?.id]);

  function set<K extends keyof DoorPageData>(key: K, value: DoorPageData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // Main door-page autosave
  const buildPayload = useCallback((data: DoorPageData) => {
    const slug = data.slug || slugify(data.title);
    return {
      title: data.title,
      slug,
      body: data.body,
      meta_title: data.meta_title,
      meta_description: data.meta_description,
      target_queries: data.target_queries,
      funnel_targets: data.funnel_targets,
      og_image_path: data.og_image_path,
      og_alt: data.og_alt,
      status: data.status,
      seo_title: data.seo_title,
      seo_description: data.seo_description,
      focus_keyphrase: data.focus_keyphrase,
      secondary_keyphrases: data.secondary_keyphrases,
      search_intent: data.search_intent,
      citation_summary: data.citation_summary,
      first_sentence_extractable: data.first_sentence_extractable,
      paa_pairs: data.paa_pairs,
      entity_tags: data.entity_tags,
      article_type: data.article_type,
      hook_line: data.hook_line,
      tension_line: data.tension_line,
    };
  }, []);

  const { status: autosaveStatus } = useAutosave({
    data: form,
    endpoint: "/api/admin/door-pages",
    id: form.id,
    buildPayload,
    enabled: form.title.trim().length > 0,
    onCreated: (newId) => {
      setForm((prev) => {
        const slug = prev.slug || slugify(prev.title) || newId;
        router.replace(`/admin/door-pages/${slug}`, { scroll: false });
        return { ...prev, id: newId };
      });
    },
  });

  // Linked-songs autosave (only after door page exists)
  useEffect(() => {
    if (!form.id) return;
    const json = JSON.stringify(linkedSongIds);
    if (json === songsSyncedRef.current) return;
    const t = setTimeout(() => {
      fetch(`/api/admin/door-pages/${form.id}/songs`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ song_ids: linkedSongIds }),
      })
        .then((r) => {
          if (r.ok) songsSyncedRef.current = json;
        })
        .catch(() => {});
    }, SUB_RESOURCE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [linkedSongIds, form.id]);

  // Linked-art autosave (only after door page exists)
  useEffect(() => {
    if (!form.id) return;
    const json = JSON.stringify(linkedArtIds);
    if (json === artSyncedRef.current) return;
    const t = setTimeout(() => {
      fetch(`/api/admin/door-pages/${form.id}/art`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ art_ids: linkedArtIds }),
      })
        .then((r) => {
          if (r.ok) artSyncedRef.current = json;
        })
        .catch(() => {});
    }, SUB_RESOURCE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [linkedArtIds, form.id]);

  function addSong(id: string) {
    if (linkedSongIds.includes(id)) return;
    setLinkedSongIds([...linkedSongIds, id]);
    setSongSearch("");
  }

  function removeSong(id: string) {
    setLinkedSongIds(linkedSongIds.filter((x) => x !== id));
  }

  function moveSong(id: string, dir: -1 | 1) {
    const idx = linkedSongIds.indexOf(id);
    const newIdx = idx + dir;
    if (idx < 0 || newIdx < 0 || newIdx >= linkedSongIds.length) return;
    const next = [...linkedSongIds];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    setLinkedSongIds(next);
  }

  function addArt(id: string) {
    if (linkedArtIds.includes(id)) return;
    setLinkedArtIds([...linkedArtIds, id]);
    setArtSearch("");
  }

  function removeArt(id: string) {
    setLinkedArtIds(linkedArtIds.filter((x) => x !== id));
  }

  function moveArt(id: string, dir: -1 | 1) {
    const idx = linkedArtIds.indexOf(id);
    const newIdx = idx + dir;
    if (idx < 0 || newIdx < 0 || newIdx >= linkedArtIds.length) return;
    const next = [...linkedArtIds];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    setLinkedArtIds(next);
  }

  async function handleDelete() {
    if (!form.id) return;
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
        <h1 className="admin-page__title">{form.id ? "Edit Door Page" : "New Door Page"}</h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {form.id && (
            <button type="button" className="admin-btn admin-btn--danger" onClick={handleDelete}>
              Delete
            </button>
          )}
          <span className={`autosave-status autosave-status--${autosaveStatus}`}>
            {autosaveStatus === "saving" && "Saving..."}
            {autosaveStatus === "saved" && "Saved"}
            {autosaveStatus === "error" && "Save failed"}
            {autosaveStatus === "idle" && !form.id && "Type a title to begin"}
          </span>
        </div>
      </div>

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
          className="obsv-editor__input obsv-editor__input--mono"
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
        {!form.id && linkedSongIds.length > 0 && (
          <p style={{ fontSize: 11, color: "#888", marginTop: 6 }}>
            Saved once the door page is created.
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
        {!form.id && linkedArtIds.length > 0 && (
          <p style={{ fontSize: 11, color: "#888", marginTop: 6 }}>
            Saved once the door page is created.
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
