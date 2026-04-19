"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { slugify } from "@/lib/utils";
import { useAutosave } from "@/hooks/useAutosave";
import { TaxonomyPicker } from "@/components/TaxonomyPicker";
import { MediaLibrary } from "@/components/MediaLibrary";
import { SongVisibilityChat } from "@/components/SongVisibilityChat";
import { SongVisibilitySections, type SongVisibilitySectionsHandle } from "@/components/SongVisibilitySections";
import { FocalPointPicker, type CropRatio, type CropPatch } from "@/components/FocalPointPicker";
import { FeaturedPicker } from "@/components/FeaturedPicker";

interface ExpansionSummary {
  id: string;
  title: string;
  status: string;
  display_order: number;
}

interface SongData {
  id?: string;
  album_id: string;
  title: string;
  slug: string;
  track_number: number;
  duration_seconds: number | null;
  streaming_path: string | null;
  download_path: string | null;
  download_path_mp3: string | null;
  download_path_flac: string | null;
  download_path_wav: string | null;
  lyrics: string | null;
  instrumental: boolean;
  price: number | null;
  is_single: boolean;
  status: string;
  release_date: string | null;
  song_summary: string | null;
  chorus: string | null;
  chad_quote: string | null;
  isrc: string | null;
  playback_mode: string | null;
  focus_keyphrase: string;
  secondary_keyphrases: string[];
  search_intent: string;
  citation_summary: string;
  paa_pairs: { question: string; answer: string }[];
  entity_tags: string[];
  seo_title: string;
  seo_description: string;
  topic_ids: string[];
  art_image_path: string | null;
  art_alt: string | null;
  hero_focal_x: number | null;
  hero_focal_y: number | null;
  hero_zoom: number | null;
  card_focal_x: number | null;
  card_focal_y: number | null;
  card_zoom: number | null;
  portrait_focal_x: number | null;
  portrait_focal_y: number | null;
  portrait_zoom: number | null;
  updated_at: string | null;
}

interface TopicOption {
  id: string;
  label: string;
  slug: string;
}

const emptySong: SongData = {
  album_id: "",
  title: "",
  slug: "",
  track_number: 1,
  duration_seconds: null,
  streaming_path: null,
  download_path: null,
  download_path_mp3: null,
  download_path_flac: null,
  download_path_wav: null,
  lyrics: null,
  instrumental: false,
  price: null,
  is_single: false,
  status: "draft",
  release_date: null,
  song_summary: null,
  chorus: null,
  chad_quote: null,
  isrc: null,
  playback_mode: null,
  focus_keyphrase: "",
  secondary_keyphrases: [],
  search_intent: "informational",
  citation_summary: "",
  paa_pairs: [],
  entity_tags: [],
  seo_title: "",
  seo_description: "",
  topic_ids: [],
  art_image_path: null,
  art_alt: null,
  hero_focal_x: null,
  hero_focal_y: null,
  hero_zoom: 1.0,
  card_focal_x: null,
  card_focal_y: null,
  card_zoom: 1.0,
  portrait_focal_x: null,
  portrait_focal_y: null,
  portrait_zoom: 1.0,
  updated_at: null,
};

interface AlbumOption {
  id: string;
  title: string;
  cover_art_path?: string | null;
  cover_art_alt?: string | null;
}

function SongCoverArtPanel({
  imagePath,
  altText,
  crops,
  onImageChange,
  onAltChange,
  onCropsChange,
  onResetCrops,
}: {
  imagePath: string;
  altText: string;
  crops: Record<CropRatio, { focalX: number | null; focalY: number | null; zoom: number | null }>;
  onImageChange: (url: string) => void;
  onAltChange: (alt: string) => void;
  onCropsChange: (ratio: CropRatio, patch: CropPatch) => void;
  onResetCrops: () => void;
}) {
  const [mediaOpen, setMediaOpen] = useState(false);
  const cardCrop = crops.card;
  const cardFx = cardCrop.focalX ?? 50;
  const cardFy = cardCrop.focalY ?? 50;

  return (
    <div className="obsv-editor__panel">
      <h3 className="obsv-editor__panel-title">Cover Art</h3>
      <p style={{ margin: "0 0 var(--space-sm)", fontSize: "0.75rem", color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>
        Optional. If set, overrides the album&rsquo;s cover art everywhere this song appears.
      </p>

      {imagePath ? (
        <div className="cover-art-preview">
          <img
            src={imagePath}
            alt={altText || "Song cover art preview"}
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
              onClick={() => { onImageChange(""); onResetCrops(); }}
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

      {imagePath && (
        <div className="obsv-editor__field" style={{ marginTop: "var(--space-sm)" }}>
          <label className="obsv-editor__label" htmlFor="song_art_alt">Alt Text</label>
          <input
            id="song_art_alt"
            className="obsv-editor__input"
            type="text"
            value={altText || ""}
            onChange={(e) => onAltChange(e.target.value)}
            placeholder="Describe the cover art"
          />
        </div>
      )}

      {imagePath && (
        <FocalPointPicker
          src={imagePath}
          alt={altText || "Song cover art"}
          crops={crops}
          onChange={onCropsChange}
        />
      )}

      <MediaLibrary
        open={mediaOpen}
        onClose={() => setMediaOpen(false)}
        onSelect={(url: string) => {
          onImageChange(url);
          setMediaOpen(false);
        }}
      />
    </div>
  );
}

export function SongEditor({ initial, presetAlbumId }: { initial?: SongData; presetAlbumId?: string }) {
  const router = useRouter();
  const sectionsRef = useRef<SongVisibilitySectionsHandle>(null);
  const [form, setForm] = useState<SongData>(() => {
    if (!initial) return { ...emptySong, album_id: presetAlbumId || "" };
    return {
      ...initial,
      focus_keyphrase: initial.focus_keyphrase || "",
      secondary_keyphrases: initial.secondary_keyphrases || [],
      search_intent: initial.search_intent || "informational",
      citation_summary: initial.citation_summary || "",
      paa_pairs: initial.paa_pairs || [],
      entity_tags: initial.entity_tags || [],
      seo_title: initial.seo_title || "",
      seo_description: initial.seo_description || "",
      topic_ids: initial.topic_ids || [],
    };
  });
  const [albums, setAlbums] = useState<AlbumOption[]>([]);
  const [allTopics, setAllTopics] = useState<TopicOption[]>([]);
  const [expansions, setExpansions] = useState<ExpansionSummary[]>([]);
  const [linkedDoors, setLinkedDoors] = useState<
    { id: string; title: string; slug: string; status: string }[]
  >([]);

  useEffect(() => {
    fetch("/api/admin/albums")
      .then((r) => r.json())
      .then((data: AlbumOption[]) => setAlbums(data));
    fetch("/api/admin/topics")
      .then((r) => r.json())
      .then((data: TopicOption[]) => setAllTopics(data));
  }, []);

  useEffect(() => {
    if (!form.id) return;
    fetch(`/api/admin/expansions?song_id=${form.id}`)
      .then((r) => r.json())
      .then((data: ExpansionSummary[]) => setExpansions(data));
    fetch(`/api/admin/songs/${form.id}/linked-doors`)
      .then((r) => r.json())
      .then((data) => setLinkedDoors(Array.isArray(data) ? data : []))
      .catch(() => setLinkedDoors([]));
  }, [form.id]);

  const set = useCallback((field: keyof SongData, value: unknown) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  function handleTitleChange(value: string) {
    set("title", value);
    if (!form.id) {
      set("slug", slugify(value));
    }
  }

  const buildPayload = useCallback(
    (d: SongData) => ({
      album_id: d.album_id,
      title: d.title,
      slug: d.slug,
      track_number: d.track_number,
      duration_seconds: d.duration_seconds,
      streaming_path: d.streaming_path,
      download_path: d.download_path,
      download_path_mp3: d.download_path_mp3,
      download_path_flac: d.download_path_flac,
      download_path_wav: d.download_path_wav,
      lyrics: d.lyrics,
      instrumental: d.instrumental,
      price: d.price,
      is_single: d.is_single,
      status: d.status,
      release_date: d.release_date,
      song_summary: d.song_summary,
      chorus: d.chorus,
      chad_quote: d.chad_quote,
      isrc: d.isrc,
      playback_mode: d.playback_mode,
      focus_keyphrase: d.focus_keyphrase,
      secondary_keyphrases: d.secondary_keyphrases,
      search_intent: d.search_intent,
      citation_summary: d.citation_summary,
      paa_pairs: d.paa_pairs,
      entity_tags: d.entity_tags,
      seo_title: d.seo_title,
      seo_description: d.seo_description,
      topic_ids: d.topic_ids,
      art_image_path: d.art_image_path,
      art_alt: d.art_alt,
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

  function toggleTopic(id: string) {
    setForm((prev) => {
      const has = prev.topic_ids.includes(id);
      return {
        ...prev,
        topic_ids: has
          ? prev.topic_ids.filter((v) => v !== id)
          : [...prev.topic_ids, id],
      };
    });
  }

  const { status: autosaveStatus } = useAutosave({
    data: form,
    endpoint: "/api/admin/songs",
    id: form.id,
    buildPayload,
    onCreated: (newId) => {
      setForm((prev) => ({ ...prev, id: newId }));
      setForm((prev) => {
        const slug = prev.slug || newId;
        router.replace(`/admin/music/songs/${slug}`, { scroll: false });
        return prev;
      });
    },
    enabled: !!form.title,
  });

  // Rising Compass calibration
  const [rcStatus, setRcStatus] = useState<"idle" | "calibrating" | "done" | "error">("idle");
  const [rcResult, setRcResult] = useState<{ tier: string; tier_label: string; charge: number; charge_summary: string } | null>(null);

  async function handleCalibrate() {
    if (!form.title || !form.lyrics) return;
    setRcStatus("calibrating");
    setRcResult(null);
    try {
      const res = await fetch("/api/admin/calibrate-song", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: form.title, artist: "Chad Lewine", lyrics: form.lyrics }),
      });
      const data = await res.json();
      if (data.error) {
        setRcStatus("error");
      } else {
        setRcResult(data);
        setRcStatus("done");
      }
    } catch {
      setRcStatus("error");
    }
  }

  async function handleDelete() {
    if (!form.id) return;
    if (!confirm("Delete this song? This cannot be undone.")) return;
    const res = await fetch(`/api/admin/songs/${form.id}`, { method: "DELETE" });
    if (res.ok) router.push("/admin/music");
  }

  return (
    <div className="obsv-editor">
      <div className="obsv-editor__header">
        <h1 className="admin-page__title">
          {!form.id ? "New Song" : "Edit Song"}
        </h1>
        <div className="obsv-editor__actions">
          {form.id && form.slug && (
            <Link
              href={`/music/songs/${form.slug}`}
              className="admin-btn admin-btn--secondary"
              target="_blank"
            >
              View Song
            </Link>
          )}
          {form.id && (
            <button
              className="admin-btn admin-btn--danger"
              onClick={handleDelete}
              type="button"
            >
              Delete
            </button>
          )}
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
              onChange={(e) => handleTitleChange(e.target.value)}
            />
          </div>

          <div className="obsv-editor__field">
            <label className="obsv-editor__label" htmlFor="slug">Slug</label>
            <input
              id="slug"
              className="obsv-editor__input obsv-editor__input--mono"
              type="text"
              value={form.slug}
              onChange={(e) => set("slug", e.target.value)}
            />
          </div>

          <div className="obsv-editor__field" style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem" }}>
            <input
              id="instrumental"
              type="checkbox"
              checked={form.instrumental}
              onChange={(e) => set("instrumental", e.target.checked)}
            />
            <label className="obsv-editor__label" htmlFor="instrumental" style={{ margin: 0 }}>Instrumental (no lyrics)</label>
          </div>

          <div className="obsv-editor__field">
            <label className="obsv-editor__label" htmlFor="lyrics">Lyrics</label>
            <textarea
              id="lyrics"
              className="obsv-editor__input"
              value={form.instrumental ? "" : (form.lyrics || "").replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\\r/g, "\n")}
              onChange={(e) => set("lyrics", e.target.value || null)}
              rows={16}
              disabled={form.instrumental}
              placeholder={form.instrumental ? "Instrumental — no lyrics" : undefined}
              style={{ fontFamily: "var(--font-mono)", whiteSpace: "pre-wrap", opacity: form.instrumental ? 0.5 : 1 }}
            />
          </div>

          <div className="obsv-editor__field">
            <label className="obsv-editor__label" htmlFor="song_summary">Song Summary</label>
            <textarea
              id="song_summary"
              className="obsv-editor__input"
              value={form.song_summary || ""}
              onChange={(e) => set("song_summary", e.target.value || null)}
              rows={4}
              placeholder="About this song..."
            />
          </div>

          <div className="obsv-editor__field">
            <label className="obsv-editor__label" htmlFor="chorus">Chorus</label>
            <textarea
              id="chorus"
              className="obsv-editor__input"
              value={form.instrumental ? "" : (form.chorus || "")}
              onChange={(e) => set("chorus", e.target.value || null)}
              rows={4}
              disabled={form.instrumental}
              placeholder={form.instrumental ? "Instrumental — no chorus" : "Paste the chorus lyrics here — shown in the homepage words-only feed."}
              style={{ fontFamily: "var(--font-mono)", whiteSpace: "pre-wrap", opacity: form.instrumental ? 0.5 : 1 }}
            />
          </div>

          <div className="obsv-editor__field">
            <label className="obsv-editor__label" htmlFor="chad_quote">Quote from Chad</label>
            <textarea
              id="chad_quote"
              className="obsv-editor__input"
              value={form.chad_quote || ""}
              onChange={(e) => set("chad_quote", e.target.value || null)}
              rows={3}
              placeholder="A short quote from you about this song — appears in section 1 of the landing page."
            />
          </div>

          {/* Art Pairings */}
          {form.id && (
            <div style={{ marginTop: "1.5rem" }}>
              <h2 style={{ fontFamily: "var(--font-ui)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-tertiary)", marginBottom: "0.75rem" }}>
                Art you might like (shown on song detail page)
              </h2>
              <FeaturedPicker kind="art" parentRef={form.id} />
            </div>
          )}

          {/* Visibility Engine */}
          {form.id && (
            <div style={{ marginTop: "1.5rem" }}>
              <h2 style={{ fontFamily: "var(--font-ui)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-tertiary)", marginBottom: "0.75rem" }}>
                Visibility Engine
              </h2>
              <SongVisibilityChat
                songId={form.id}
                onSectionsUpdated={() => sectionsRef.current?.refresh()}
              />
              <div style={{ marginTop: "1rem" }}>
                <SongVisibilitySections ref={sectionsRef} songId={form.id} />
              </div>
            </div>
          )}

          {/* Linked Door Pages (read-only) */}
          {form.id && (
            <div className="obsv-editor__panel" style={{ marginTop: "1rem" }}>
              <p style={{ fontFamily: "var(--font-ui)", fontSize: "0.75rem", color: "var(--text-tertiary)", margin: "0 0 0.5rem" }}>
                Linked from door pages {linkedDoors.length > 0 ? `(${linkedDoors.length})` : ""}
              </p>
              {linkedDoors.length === 0 ? (
                <p style={{ fontFamily: "var(--font-ui)", fontSize: "0.75rem", color: "#888", margin: 0 }}>
                  Not attached to any door page yet.
                </p>
              ) : (
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                  {linkedDoors.map((d) => (
                    <li key={d.id} style={{ fontFamily: "var(--font-ui)", fontSize: "0.8rem" }}>
                      <Link href={`/admin/door-pages/${d.id}`} style={{ color: "var(--text-link)" }}>
                        {d.title}
                      </Link>
                      <span style={{ color: "#888", marginLeft: 8 }}>
                        /{d.slug} · {d.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Legacy Expansions */}
          {form.id && expansions.length > 0 && (
            <div className="obsv-editor__panel">
              <p style={{ fontFamily: "var(--font-ui)", fontSize: "0.75rem", color: "var(--text-tertiary)", margin: "0 0 0.35rem" }}>
                Legacy Expansions ({expansions.length})
              </p>
              {expansions.map((exp) => (
                <div key={exp.id} style={{ marginBottom: "0.25rem" }}>
                  <Link
                    href={`/admin/music/songs/${form.id}/expansions/${exp.id}`}
                    style={{ color: "var(--text-link)", fontFamily: "var(--font-ui)", fontSize: "0.75rem" }}
                  >
                    {exp.title || "Untitled"}
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="obsv-editor__sidebar">
          {/* Publish */}
          <div className="obsv-editor__panel">
            <h3 className="obsv-editor__panel-title">Publish</h3>
            <div className="obsv-editor__field">
              <label className="obsv-editor__label" htmlFor="status">Status</label>
              <select
                id="status"
                className="obsv-editor__input"
                value={form.status}
                onChange={(e) => set("status", e.target.value)}
              >
                <option value="draft">Draft</option>
                <option value="unreleased">Unreleased</option>
                <option value="published">Published</option>
              </select>
            </div>
          </div>

          {/* Content Freshness */}
          {form.updated_at && (() => {
            const months = (Date.now() - new Date(form.updated_at).getTime()) / (1000 * 60 * 60 * 24 * 30);
            const color = months > 12 ? "#ff3333" : months > 6 ? "#ffbb33" : "#33cc55";
            const label = months > 12 ? "Stale" : months > 6 ? "Aging" : "Fresh";
            const dateStr = new Date(form.updated_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
            return (
              <div className="obsv-editor__panel" style={{ borderLeft: `3px solid ${color}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, display: "inline-block", flexShrink: 0 }} />
                  <span style={{ fontFamily: "var(--font-ui)", fontSize: "0.75rem", fontWeight: 600, color }}>{label}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", color: "var(--text-tertiary)", marginLeft: "auto" }}>{dateStr}</span>
                </div>
              </div>
            );
          })()}

          {/* Song Details */}
          <div className="obsv-editor__panel">
            <h3 className="obsv-editor__panel-title">Song Details</h3>

            <div className="obsv-editor__field">
              <label className="obsv-editor__label" htmlFor="album_id">Parent Album</label>
              <select
                id="album_id"
                className="obsv-editor__input"
                value={form.album_id}
                onChange={(e) => set("album_id", e.target.value)}
              >
                <option value="">Select album...</option>
                {albums.map((a) => (
                  <option key={a.id} value={a.id}>{a.title}</option>
                ))}
              </select>
            </div>

            <div className="obsv-editor__field">
              <label className="obsv-editor__label" htmlFor="track_number">Track Number</label>
              <input
                id="track_number"
                className="obsv-editor__input"
                type="number"
                min={1}
                value={form.track_number}
                onChange={(e) => set("track_number", parseInt(e.target.value) || 1)}
              />
            </div>

            <div className="obsv-editor__field">
              <label className="obsv-editor__label" htmlFor="duration_seconds">Duration (seconds)</label>
              <input
                id="duration_seconds"
                className="obsv-editor__input"
                type="number"
                min={0}
                value={form.duration_seconds ?? ""}
                onChange={(e) => set("duration_seconds", e.target.value ? parseInt(e.target.value) : null)}
              />
            </div>

            <div className="obsv-editor__field">
              <label className="obsv-editor__label" htmlFor="release_date">Release Date</label>
              <input
                id="release_date"
                className="obsv-editor__input"
                type="date"
                value={form.release_date || ""}
                onChange={(e) => set("release_date", e.target.value || null)}
              />
            </div>

            <div className="obsv-editor__field">
              <label className="obsv-editor__label" htmlFor="isrc">ISRC</label>
              <input
                id="isrc"
                className="obsv-editor__input obsv-editor__input--mono"
                type="text"
                value={form.isrc || ""}
                onChange={(e) => set("isrc", e.target.value || null)}
                placeholder="CC-XXX-YY-NNNNN"
              />
            </div>
          </div>

          <TaxonomyPicker
            heading="Topics"
            items={allTopics}
            selected={form.topic_ids}
            onToggle={toggleTopic}
            onCreate={(item) => {
              setAllTopics((prev) =>
                [...prev, item as TopicOption].sort((a, b) => a.label.localeCompare(b.label))
              );
              setForm((prev) => ({ ...prev, topic_ids: [...prev.topic_ids, item.id] }));
            }}
            createEndpoint="/api/admin/topics"
            createPlaceholder="+ New topic"
            nameField="label"
          />

          <SongCoverArtPanel
            imagePath={form.art_image_path || ""}
            altText={form.art_alt || ""}
            crops={{
              hero: { focalX: form.hero_focal_x, focalY: form.hero_focal_y, zoom: form.hero_zoom },
              card: { focalX: form.card_focal_x, focalY: form.card_focal_y, zoom: form.card_zoom },
              portrait: { focalX: form.portrait_focal_x, focalY: form.portrait_focal_y, zoom: form.portrait_zoom },
            }}
            onImageChange={(url) => set("art_image_path", url || null)}
            onAltChange={(alt) => set("art_alt", alt || null)}
            onCropsChange={(ratio, patch) => {
              if ("focalX" in patch) set(`${ratio}_focal_x` as keyof SongData, patch.focalX as SongData[keyof SongData]);
              if ("focalY" in patch) set(`${ratio}_focal_y` as keyof SongData, patch.focalY as SongData[keyof SongData]);
              if ("zoom" in patch) set(`${ratio}_zoom` as keyof SongData, (patch.zoom ?? 1) as SongData[keyof SongData]);
            }}
            onResetCrops={() => {
              (["hero", "card", "portrait"] as CropRatio[]).forEach((r) => {
                set(`${r}_focal_x` as keyof SongData, null as SongData[keyof SongData]);
                set(`${r}_focal_y` as keyof SongData, null as SongData[keyof SongData]);
                set(`${r}_zoom` as keyof SongData, 1 as SongData[keyof SongData]);
              });
            }}
          />

          {/* Files */}
          <div className="obsv-editor__panel">
            <h3 className="obsv-editor__panel-title">Files</h3>

            <div className="obsv-editor__field">
              <label className="obsv-editor__label" htmlFor="streaming_path">Streaming File Path</label>
              <input
                id="streaming_path"
                className="obsv-editor__input obsv-editor__input--mono"
                type="text"
                value={form.streaming_path || ""}
                onChange={(e) => set("streaming_path", e.target.value || null)}
                placeholder="https://cdn.bunny.net/..."
              />
            </div>

            <div className="obsv-editor__field">
              <label className="obsv-editor__label" htmlFor="download_path_mp3">Download — MP3</label>
              <input
                id="download_path_mp3"
                className="obsv-editor__input obsv-editor__input--mono"
                type="text"
                value={form.download_path_mp3 || ""}
                onChange={(e) => set("download_path_mp3", e.target.value || null)}
                placeholder="https://cdn.bunny.net/...mp3"
              />
            </div>

            <div className="obsv-editor__field">
              <label className="obsv-editor__label" htmlFor="download_path_flac">Download — FLAC</label>
              <input
                id="download_path_flac"
                className="obsv-editor__input obsv-editor__input--mono"
                type="text"
                value={form.download_path_flac || ""}
                onChange={(e) => set("download_path_flac", e.target.value || null)}
                placeholder="https://cdn.bunny.net/...flac"
              />
            </div>

            <div className="obsv-editor__field">
              <label className="obsv-editor__label" htmlFor="download_path_wav">Download — WAV</label>
              <input
                id="download_path_wav"
                className="obsv-editor__input obsv-editor__input--mono"
                type="text"
                value={form.download_path_wav || ""}
                onChange={(e) => set("download_path_wav", e.target.value || null)}
                placeholder="https://cdn.bunny.net/...wav"
              />
            </div>

            <div className="obsv-editor__field">
              <label className="obsv-editor__label" htmlFor="download_path">Download (legacy)</label>
              <input
                id="download_path"
                className="obsv-editor__input obsv-editor__input--mono"
                type="text"
                value={form.download_path || ""}
                onChange={(e) => set("download_path", e.target.value || null)}
                placeholder="Used only if no MP3/FLAC/WAV set"
              />
            </div>
          </div>

          {/* Commerce */}
          <div className="obsv-editor__panel">
            <h3 className="obsv-editor__panel-title">Commerce</h3>

            <div className="obsv-editor__field">
              <label className="obsv-editor__label" htmlFor="price">Price ($)</label>
              <input
                id="price"
                className="obsv-editor__input"
                type="number"
                min={0}
                value={form.price ?? ""}
                step="0.01"
                onChange={(e) => set("price", e.target.value ? parseFloat(e.target.value) : null)}
                placeholder="1.99"
              />
            </div>

            <div className="obsv-editor__field" style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem" }}>
              <input
                id="is_single"
                type="checkbox"
                checked={form.is_single}
                onChange={(e) => set("is_single", e.target.checked)}
              />
              <label className="obsv-editor__label" htmlFor="is_single" style={{ margin: 0 }}>Is Single</label>
            </div>
          </div>

          {/* Playback */}
          <div className="obsv-editor__panel">
            <h3 className="obsv-editor__panel-title">Playback</h3>
            <div className="obsv-editor__field">
              <label className="obsv-editor__label" htmlFor="playback_mode">Mode</label>
              <select
                id="playback_mode"
                className="obsv-editor__input"
                value={form.playback_mode || ""}
                onChange={(e) => set("playback_mode", e.target.value || null)}
              >
                <option value="">Site default</option>
                <option value="preview">30s preview</option>
                <option value="full">Full length</option>
              </select>
            </div>
          </div>

          {/* Rising Compass */}
          <div className="obsv-editor__panel">
            <h3 className="obsv-editor__panel-title">Rising Compass</h3>
            {rcResult && (
              <div style={{ marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ fontFamily: "var(--font-ui)", fontSize: "0.875rem", fontWeight: 600, color: "var(--text-accent)" }}>
                  {rcResult.tier_label}
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.875rem", color: "var(--text-primary)" }}>
                  {rcResult.charge > 0 ? "+" : ""}{rcResult.charge}
                </span>
              </div>
            )}
            {rcResult?.charge_summary && (
              <p style={{ fontFamily: "var(--font-ui)", fontSize: "0.75rem", color: "var(--text-secondary)", margin: "0 0 0.75rem", lineHeight: 1.4 }}>
                {rcResult.charge_summary}
              </p>
            )}
            <button
              type="button"
              className="admin-btn admin-btn--secondary"
              onClick={handleCalibrate}
              disabled={rcStatus === "calibrating" || !form.title || !form.lyrics || form.instrumental}
              style={{ fontSize: "0.875rem" }}
            >
              {rcStatus === "calibrating" ? "Calibrating..." : rcResult ? "Recalibrate" : "Calibrate"}
            </button>
            {rcStatus === "error" && (
              <p style={{ color: "#ff3333", fontFamily: "var(--font-ui)", fontSize: "0.75rem", marginTop: "0.5rem" }}>
                Calibration failed. Check lyrics and try again.
              </p>
            )}
            {form.instrumental ? (
              <p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)", fontSize: "0.75rem", marginTop: "0.5rem" }}>
                Calibration disabled — song is marked instrumental.
              </p>
            ) : !form.lyrics && (
              <p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)", fontSize: "0.75rem", marginTop: "0.5rem" }}>
                Add lyrics to enable calibration.
              </p>
            )}
          </div>

        </div>
      </div>

    </div>
  );
}
