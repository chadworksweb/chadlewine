"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { slugify } from "@/lib/utils";
import { useAutosave } from "@/hooks/useAutosave";
import { MediaLibrary } from "@/components/MediaLibrary";
import { FocalPointPicker, type CropRatio, type CropPatch } from "@/components/FocalPointPicker";
import { ReleaseVisibilityChat } from "@/components/ReleaseVisibilityChat";
import { ReleaseVisibilitySections, type ReleaseVisibilitySectionsHandle } from "@/components/ReleaseVisibilitySections";
import { CubeFaceEditor } from "@/components/CubeFaceEditor";
import { SkuPanel } from "@/components/SkuPanel";
import { RELEASE_TYPE_OPTIONS } from "@/lib/release-labels";

interface AlbumData {
  id?: string;
  title: string;
  slug: string;
  release_date: string | null;
  cover_art_path: string | null;
  cover_art_alt: string | null;
  concept_statement: string | null;
  display_order: number;
  status: string;
  release_type: string;
  hero_focal_x: number | null;
  hero_focal_y: number | null;
  hero_zoom: number | null;
  card_focal_x: number | null;
  card_focal_y: number | null;
  card_zoom: number | null;
  portrait_focal_x: number | null;
  portrait_focal_y: number | null;
  portrait_zoom: number | null;
}

const emptyAlbum: AlbumData = {
  title: "",
  slug: "",
  release_date: null,
  cover_art_path: null,
  cover_art_alt: null,
  concept_statement: null,
  display_order: 0,
  status: "draft",
  release_type: "album",
  hero_focal_x: null,
  hero_focal_y: null,
  hero_zoom: 1.0,
  card_focal_x: null,
  card_focal_y: null,
  card_zoom: 1.0,
  portrait_focal_x: null,
  portrait_focal_y: null,
  portrait_zoom: 1.0,
};

export default function EditAlbumPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const [form, setForm] = useState<AlbumData | null>(null);
  const [songs, setSongs] = useState<{ id: string; title: string; slug: string; track_number: number; status: string }[]>([]);
  const [mediaOpen, setMediaOpen] = useState(false);
  const sectionsRef = useRef<ReleaseVisibilitySectionsHandle>(null);

  useEffect(() => {
    fetch(`/api/admin/releases/${id}`)
      .then((r) => r.json())
      .then(async (album) => {
        const albumUuid = album?.id || id;
        const sngs = await fetch(`/api/admin/songs?release_id=${albumUuid}`).then((r) => r.json());
        setForm({ ...emptyAlbum, ...album });
        setSongs(sngs);
      });
  }, [id]);

  const set = useCallback(<K extends keyof AlbumData>(field: K, value: AlbumData[K]) => {
    setForm((prev) => prev ? { ...prev, [field]: value } : prev);
  }, []);

  const buildPayload = useCallback(
    (d: AlbumData) => ({
      title: d.title,
      slug: d.slug,
      release_date: d.release_date,
      cover_art_path: d.cover_art_path,
      cover_art_alt: d.cover_art_alt,
      concept_statement: d.concept_statement,
      display_order: d.display_order,
      status: d.status,
      release_type: d.release_type,
      hero_focal_x: d.hero_focal_x,
      hero_focal_y: d.hero_focal_y,
      hero_zoom: d.hero_zoom,
      card_focal_x: d.card_focal_x,
      card_focal_y: d.card_focal_y,
      card_zoom: d.card_zoom,
      portrait_focal_x: d.portrait_focal_x,
      portrait_focal_y: d.portrait_focal_y,
      portrait_zoom: d.portrait_zoom,
    }),
    []
  );

  const { status: autosaveStatus } = useAutosave({
    data: form || emptyAlbum,
    endpoint: "/api/admin/releases",
    id,
    buildPayload,
    enabled: !!form && !!form.title,
  });

  async function handleDelete() {
    if (!confirm("Delete album and all songs?")) return;
    await fetch(`/api/admin/releases/${id}`, { method: "DELETE" });
    router.push("/admin/music");
  }

  function handleCropsChange(ratio: CropRatio, patch: CropPatch) {
    if (!form) return;
    if ("focalX" in patch) set(`${ratio}_focal_x` as keyof AlbumData, patch.focalX as AlbumData[keyof AlbumData]);
    if ("focalY" in patch) set(`${ratio}_focal_y` as keyof AlbumData, patch.focalY as AlbumData[keyof AlbumData]);
    if ("zoom" in patch) set(`${ratio}_zoom` as keyof AlbumData, (patch.zoom ?? 1) as AlbumData[keyof AlbumData]);
  }

  function handleResetCrops() {
    (["hero", "card", "portrait"] as CropRatio[]).forEach((r) => {
      set(`${r}_focal_x` as keyof AlbumData, null as AlbumData[keyof AlbumData]);
      set(`${r}_focal_y` as keyof AlbumData, null as AlbumData[keyof AlbumData]);
      set(`${r}_zoom` as keyof AlbumData, 1 as AlbumData[keyof AlbumData]);
    });
  }

  if (!form) return <div className="admin-page"><p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>Loading...</p></div>;

  const cardFx = form.card_focal_x ?? 50;
  const cardFy = form.card_focal_y ?? 50;

  return (
    <div className="obsv-editor">
      <div className="obsv-editor__header">
        <h1 className="admin-page__title">Edit Release</h1>
        <div className="obsv-editor__actions">
          {form.slug && (
            <Link href={`/music/releases/${form.slug}`} className="admin-btn admin-btn--secondary" target="_blank">View Album</Link>
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
            <input
              id="title"
              className="obsv-editor__input"
              type="text"
              value={form.title}
              onChange={e => { set("title", e.target.value); if (!id) set("slug", slugify(e.target.value)); }}
            />
          </div>

          <div className="obsv-editor__field">
            <label className="obsv-editor__label" htmlFor="slug">Slug</label>
            <input
              id="slug"
              className="obsv-editor__input obsv-editor__input--mono"
              type="text"
              value={form.slug}
              onChange={e => set("slug", e.target.value)}
            />
          </div>

          <div className="obsv-editor__field">
            <label className="obsv-editor__label" htmlFor="concept_statement">Concept</label>
            <textarea
              id="concept_statement"
              className="obsv-editor__input"
              value={form.concept_statement || ""}
              onChange={e => set("concept_statement", e.target.value || null)}
              rows={3}
              placeholder="The album's manifesto -- its concept, theme, the 'why' of the record."
            />
          </div>

          {form.id && (
            <SkuPanel kind="release" parentId={form.id} parentSlug={form.slug} />
          )}

          {/* Visibility Engine -- inline, mirrors songs */}
          {form.id && (
            <div style={{ marginTop: "1.5rem" }}>
              <h2 style={{ fontFamily: "var(--font-ui)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-tertiary)", marginBottom: "0.75rem" }}>
                Visibility Engine
              </h2>
              <ReleaseVisibilityChat
                albumId={form.id}
                onSectionsUpdated={() => sectionsRef.current?.refresh()}
              />
              <div style={{ marginTop: "1rem" }}>
                <ReleaseVisibilitySections ref={sectionsRef} albumId={form.id} />
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="obsv-editor__sidebar">
          <div className="obsv-editor__panel">
            <h3 className="obsv-editor__panel-title">Publish</h3>
            <div className="obsv-editor__field">
              <label className="obsv-editor__label" htmlFor="status">Status</label>
              <select id="status" className="obsv-editor__input" value={form.status} onChange={e => set("status", e.target.value)}>
                <option value="draft">Draft</option>
                <option value="unreleased">Unreleased</option>
                <option value="published">Published</option>
              </select>
            </div>
          </div>

          <div className="obsv-editor__panel">
            <h3 className="obsv-editor__panel-title">Cover Art</h3>
            {form.cover_art_path ? (
              <div className="cover-art-preview">
                {/* eslint-disable-next-line @next/next/no-img-element -- admin-only cover preview */}
                <img
                  src={form.cover_art_path}
                  alt={form.cover_art_alt || "Album cover art preview"}
                  className="cover-art-preview__img"
                  style={{ objectPosition: `${cardFx}% ${cardFy}%` }}
                />
                <div className="cover-art-preview__actions">
                  <button
                    type="button"
                    className="admin-btn admin-btn--primary"
                    onClick={() => setMediaOpen(true)}
                    style={{ fontSize: "0.6875rem", padding: "4px 12px" }}
                  >
                    Replace
                  </button>
                  <button
                    type="button"
                    className="admin-btn admin-btn--danger"
                    onClick={() => { set("cover_art_path", null); handleResetCrops(); }}
                    style={{ fontSize: "0.6875rem", padding: "4px 12px" }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="cover-art-upload"
                onClick={() => setMediaOpen(true)}
              >
                Choose Cover Art
              </button>
            )}

            {form.cover_art_path && (
              <div className="obsv-editor__field" style={{ marginTop: "var(--space-sm)" }}>
                <label className="obsv-editor__label" htmlFor="cover_art_alt">Alt Text</label>
                <input
                  id="cover_art_alt"
                  className="obsv-editor__input"
                  type="text"
                  value={form.cover_art_alt || ""}
                  onChange={e => set("cover_art_alt", e.target.value || null)}
                  placeholder="Describe the cover art"
                />
              </div>
            )}

            {form.cover_art_path && (
              <FocalPointPicker
                src={form.cover_art_path}
                alt={form.cover_art_alt || "Album cover art"}
                crops={{
                  hero: { focalX: form.hero_focal_x, focalY: form.hero_focal_y, zoom: form.hero_zoom },
                  card: { focalX: form.card_focal_x, focalY: form.card_focal_y, zoom: form.card_zoom },
                  portrait: { focalX: form.portrait_focal_x, focalY: form.portrait_focal_y, zoom: form.portrait_zoom },
                }}
                onChange={handleCropsChange}
              />
            )}
          </div>

          <div className="obsv-editor__panel">
            <h3 className="obsv-editor__panel-title">Release Details</h3>

            <div className="obsv-editor__field">
              <label className="obsv-editor__label" htmlFor="release_type">Type</label>
              <select id="release_type" className="obsv-editor__input" value={form.release_type} onChange={e => set("release_type", e.target.value)}>
                {RELEASE_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <div className="obsv-editor__field">
              <label className="obsv-editor__label" htmlFor="release_date">Release Date</label>
              <input id="release_date" className="obsv-editor__input" type="date" value={form.release_date || ""} onChange={e => set("release_date", e.target.value || null)} />
            </div>

            <div className="obsv-editor__field">
              <label className="obsv-editor__label" htmlFor="display_order">Display Order</label>
              <input id="display_order" className="obsv-editor__input" type="number" min={0} value={form.display_order} onChange={e => set("display_order", parseInt(e.target.value) || 0)} />
            </div>
          </div>
        </div>
      </div>

      {form.id && (
        <CubeFaceEditor releaseType="album" releaseId={form.id} />
      )}

      {/* Songs listing below editor */}
      <h2 style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-sm)", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "var(--space-xl) 0 var(--space-md)" }}>Songs</h2>
      <Link href={`/admin/music/songs/new?album_id=${form.id || id}`} className="admin-btn admin-btn--secondary" style={{ marginBottom: "var(--space-md)", display: "inline-block" }}>Add Song</Link>
      <table className="admin-table">
        <thead><tr><th className="admin-table__th">#</th><th className="admin-table__th">Title</th><th className="admin-table__th">Status</th></tr></thead>
        <tbody>
          {songs.sort((a, b) => a.track_number - b.track_number).map(s => (
            <tr key={s.id} className="admin-table__row">
              <td className="admin-table__td">{s.track_number}</td>
              <td className="admin-table__td"><Link href={`/admin/music/songs/${s.slug || s.id}`} className="admin-table__link">{s.title}</Link></td>
              <td className="admin-table__td"><span className={`admin-status admin-status--${s.status}`}>{s.status}</span></td>
            </tr>
          ))}
        </tbody>
      </table>

      <MediaLibrary
        open={mediaOpen}
        onClose={() => setMediaOpen(false)}
        uploadZone="cover-art"
        onSelect={(url: string, alt?: string) => {
          set("cover_art_path", url);
          if (alt && !form.cover_art_alt) set("cover_art_alt", alt);
          setMediaOpen(false);
        }}
      />
    </div>
  );
}
