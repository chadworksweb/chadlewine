"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { uploadMedia } from "@/lib/upload-media";

type Pillar =
  | "observations"
  | "songs"
  | "albums"
  | "art"
  | "pages"
  | "merch";

type Zone = "site-image" | "cover-art" | "art-fullres";

interface MediaImage {
  zone: Zone;
  name: string;
  url: string;
  tokenAuth: boolean;
  alt_text: string;
  title: string;
  pillars: Pillar[];
}

const ZONE_LABELS: Record<Zone, string> = {
  "site-image": "Site images",
  "cover-art": "Cover art",
  "art-fullres": "Art full-res",
};

const ZONE_ORDER: Zone[] = ["site-image", "cover-art", "art-fullres"];

const PILLAR_LABELS: Record<Pillar | "unattached", string> = {
  observations: "Observations",
  songs: "Songs",
  albums: "Releases",
  art: "Art",
  pages: "Pages",
  merch: "Merch",
  unattached: "Unattached",
};

const PILLAR_ORDER: Array<Pillar | "unattached"> = [
  "observations",
  "songs",
  "albums",
  "art",
  "pages",
  "merch",
  "unattached",
];

function pillChipStyle(active: boolean, disabled = false): React.CSSProperties {
  return {
    padding: "4px 10px",
    fontSize: "0.75rem",
    fontFamily: "var(--font-ui)",
    borderRadius: 999,
    border: active
      ? "1px solid var(--text-accent)"
      : "1px solid var(--border-subtle, rgba(139, 156, 247, 0.25))",
    background: active ? "var(--text-accent)" : "transparent",
    color: active ? "#fff" : disabled ? "var(--text-tertiary)" : "var(--text-primary)",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.45 : 1,
    fontWeight: active ? 600 : 500,
  };
}

export default function AdminMediaPage() {
  const [images, setImages] = useState<MediaImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [selected, setSelected] = useState<MediaImage | null>(null);
  const [editAlt, setEditAlt] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [generatingAlt, setGeneratingAlt] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [pillarFilter, setPillarFilter] = useState<Pillar | "unattached" | null>(null);
  const [zoneFilter, setZoneFilter] = useState<Zone | null>(null);
  const [uploadZone, setUploadZone] = useState<Zone>("site-image");
  const [uploadFolder, setUploadFolder] = useState<string>("");
  const [folderFilter, setFolderFilter] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(20);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [confirmingBulkDelete, setConfirmingBulkDelete] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [lastFilterKey, setLastFilterKey] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const PAGE_SIZE = 20;

  const keyOf = (img: MediaImage) => `${img.zone}::${img.name}`;

  useEffect(() => {
    const t = setTimeout(() => setSearchTerm(searchInput.trim().toLowerCase()), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  const pillarCounts = PILLAR_ORDER.reduce((acc, p) => {
    acc[p] = 0;
    return acc;
  }, {} as Record<Pillar | "unattached", number>);
  for (const img of images) {
    if (img.pillars.length === 0) pillarCounts.unattached++;
    for (const p of img.pillars) pillarCounts[p as Pillar]++;
  }

  const zoneCounts = ZONE_ORDER.reduce((acc, z) => {
    acc[z] = 0;
    return acc;
  }, {} as Record<Zone, number>);
  for (const img of images) zoneCounts[img.zone]++;

  // Derive folder tree from currently-visible-zone files. "(root)" for
  // zone-root files. Folders scoped to the currently-selected zone so the
  // list stays meaningful.
  const folderCounts = new Map<string, number>();
  for (const img of images) {
    if (zoneFilter && img.zone !== zoneFilter) continue;
    const parts = img.name.split("/");
    const folder = parts.length > 1 ? parts.slice(0, -1).join("/") : "(root)";
    folderCounts.set(folder, (folderCounts.get(folder) ?? 0) + 1);
  }
  const folderList = [...folderCounts.entries()].sort(([a], [b]) => {
    if (a === "(root)") return -1;
    if (b === "(root)") return 1;
    return a.localeCompare(b);
  });

  const visibleImages = images.filter((img) => {
    if (zoneFilter && img.zone !== zoneFilter) return false;
    if (folderFilter !== null) {
      const parts = img.name.split("/");
      const folder = parts.length > 1 ? parts.slice(0, -1).join("/") : "(root)";
      if (folder !== folderFilter) return false;
    }
    if (pillarFilter) {
      if (pillarFilter === "unattached") {
        if (img.pillars.length > 0) return false;
      } else if (!img.pillars.includes(pillarFilter)) {
        return false;
      }
    }
    if (searchTerm) {
      const hay = `${img.name} ${img.alt_text} ${img.title}`.toLowerCase();
      if (!hay.includes(searchTerm)) return false;
    }
    return true;
  });

  // Render only a page at a time. Reset the window whenever the filter/search
  // changes (guarded set-during-render -- React's documented pattern).
  const filterKey = `${searchTerm}|${zoneFilter ?? ""}|${folderFilter ?? ""}|${pillarFilter ?? ""}`;
  if (filterKey !== lastFilterKey) {
    setLastFilterKey(filterKey);
    setVisibleCount(PAGE_SIZE);
  }
  const shownImages = visibleImages.slice(0, visibleCount);
  const hasMore = visibleImages.length > shownImages.length;

  async function copyValue(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1200);
    } catch {
      // Non-secure contexts may reject clipboard. Fall back silently.
    }
  }

  const fetchImages = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/media");
    if (res.ok) setImages(await res.json());
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- client-side data load on mount
  useEffect(() => { fetchImages(); }, [fetchImages]);

  function selectImage(img: MediaImage) {
    setSelected(img);
    setEditAlt(img.alt_text);
    setEditTitle(img.title);
  }

  async function saveMeta() {
    if (!selected) return;
    setSaving(true);
    await fetch("/api/admin/media", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: selected.name, alt_text: editAlt, title: editTitle }),
    });
    setImages((prev) =>
      prev.map((img) =>
        img.name === selected.name ? { ...img, alt_text: editAlt, title: editTitle } : img
      )
    );
    setSelected({ ...selected, alt_text: editAlt, title: editTitle });
    setSaving(false);
  }

  async function generateAlt() {
    if (!selected) return;
    setGeneratingAlt(true);
    try {
      const res = await fetch("/api/admin/media/generate-alt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: selected.url }),
      });
      const data = await res.json();
      if (res.ok && data.alt_text) {
        setEditAlt(data.alt_text);
      } else {
        alert(data.error || "Failed to generate alt text");
      }
    } catch {
      alert("Failed to generate alt text");
    }
    setGeneratingAlt(false);
  }

  async function uploadFile(file: File) {
    setUploading(true);
    setError("");
    try {
      const result = await uploadMedia(file, {
        type: uploadZone,
        folder: uploadFolder.trim() || undefined,
      });
      await fetchImages();
      if (result.renamedTo) {
        setError(`That name was taken, so it uploaded as "${result.renamedTo}".`);
      }
    } catch (err) {
      setError((err as Error).message);
    }
    setUploading(false);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = "";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  }

  async function handleDelete(img: MediaImage) {
    if (!confirm(`Delete "${img.name}" from ${ZONE_LABELS[img.zone]}?`)) return;
    await fetch("/api/admin/media", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: img.name, zone: img.zone }),
    });
    if (selected?.name === img.name && selected?.zone === img.zone) setSelected(null);
    fetchImages();
  }

  function toggleSelect(key: string) {
    setConfirmingBulkDelete(false);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function bulkDelete() {
    if (selectedKeys.size === 0) return;
    setBulkDeleting(true);
    const targets = images.filter((img) => selectedKeys.has(keyOf(img)));
    await Promise.all(
      targets.map((img) =>
        fetch("/api/admin/media", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: img.name, zone: img.zone }),
        }),
      ),
    );
    if (selected && selectedKeys.has(keyOf(selected))) setSelected(null);
    setSelectedKeys(new Set());
    setConfirmingBulkDelete(false);
    setBulkDeleting(false);
    fetchImages();
  }

  async function handleMove(img: MediaImage) {
    const parts = img.name.split("/");
    const filename = parts.pop()!;
    const currentFolder = parts.join("/");
    const input = prompt(
      `Move "${filename}" to which folder in ${ZONE_LABELS[img.zone]}?\nBlank = zone root. No leading/trailing slashes.`,
      currentFolder,
    );
    if (input === null) return;
    const newFolder = input.trim().replace(/^\/+|\/+$/g, "");
    const toPath = newFolder ? `${newFolder}/${filename}` : filename;
    if (toPath === img.name) return;

    const res = await fetch("/api/admin/media/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ zone: img.zone, fromPath: img.name, toPath }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `Move failed (${res.status})` }));
      alert(err.error || "Move failed.");
      return;
    }
    setSelected(null);
    fetchImages();
  }

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">Media Library</h1>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-md)" }}>
          <input
            type="search"
            placeholder="Search filename, alt, title…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="obsv-editor__input"
            style={{ width: 260, fontSize: "0.8125rem" }}
          />
          <span style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-sm)", color: "var(--text-tertiary)" }}>
            {visibleImages.length}
            {searchTerm && visibleImages.length !== images.length ? ` / ${images.length}` : ""} images
          </span>
        </div>
      </div>

      <div style={{ marginBottom: "var(--space-md)", border: "1px solid var(--border-subtle, #2a2a2a)", borderRadius: 4 }}>
        <button
          type="button"
          onClick={() => setFiltersOpen((v) => !v)}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 14px",
            background: "transparent",
            border: "none",
            color: "var(--text-primary)",
            fontFamily: "var(--font-ui)",
            fontSize: "0.8125rem",
            cursor: "pointer",
            textAlign: "left",
          }}
          aria-expanded={filtersOpen}
        >
          <span>
            Filters
            {pillarFilter && (
              <span style={{ marginLeft: 8, color: "var(--text-tertiary)", fontSize: "0.75rem" }}>
                · Pillar: {PILLAR_LABELS[pillarFilter]}
              </span>
            )}
          </span>
          <span style={{ color: "var(--text-tertiary)" }}>{filtersOpen ? "▾" : "▸"}</span>
        </button>
        {filtersOpen && (
          <div style={{ padding: "0 14px 12px", borderTop: "1px solid var(--border-subtle, #2a2a2a)" }}>
            <div style={{ fontSize: "0.625rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-tertiary)", margin: "10px 0 6px" }}>
              By zone
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
              <button
                type="button"
                onClick={() => setZoneFilter(null)}
                style={pillChipStyle(zoneFilter === null)}
              >
                All ({images.length})
              </button>
              {ZONE_ORDER.map((z) => (
                <button
                  key={z}
                  type="button"
                  onClick={() => setZoneFilter((cur) => (cur === z ? null : z))}
                  disabled={zoneCounts[z] === 0}
                  style={pillChipStyle(zoneFilter === z, zoneCounts[z] === 0)}
                >
                  {ZONE_LABELS[z]} ({zoneCounts[z]})
                </button>
              ))}
            </div>
            <div style={{ fontSize: "0.625rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-tertiary)", margin: "10px 0 6px" }}>
              By folder{zoneFilter ? ` (${ZONE_LABELS[zoneFilter]})` : " (all zones)"}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
              <button
                type="button"
                onClick={() => setFolderFilter(null)}
                style={pillChipStyle(folderFilter === null)}
              >
                All
              </button>
              {folderList.map(([folder, count]) => (
                <button
                  key={folder}
                  type="button"
                  onClick={() => setFolderFilter((cur) => (cur === folder ? null : folder))}
                  style={pillChipStyle(folderFilter === folder)}
                >
                  {folder} ({count})
                </button>
              ))}
            </div>
            <div style={{ fontSize: "0.625rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-tertiary)", margin: "10px 0 6px" }}>
              By pillar
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              <button
                type="button"
                onClick={() => setPillarFilter(null)}
                style={pillChipStyle(pillarFilter === null)}
              >
                All ({images.length})
              </button>
              {PILLAR_ORDER.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPillarFilter((cur) => (cur === p ? null : p))}
                  disabled={pillarCounts[p] === 0}
                  style={pillChipStyle(pillarFilter === p, pillarCounts[p] === 0)}
                >
                  {PILLAR_LABELS[p]} ({pillarCounts[p]})
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8, fontFamily: "var(--font-ui)", fontSize: "0.75rem", color: "var(--text-secondary)", flexWrap: "wrap" }}>
        <span>Upload target:</span>
        <select
          value={uploadZone}
          onChange={(e) => setUploadZone(e.target.value as Zone)}
          style={{
            padding: "4px 8px",
            fontSize: "0.75rem",
            fontFamily: "var(--font-ui)",
            border: "1px solid var(--border-subtle, #2a2a2a)",
            borderRadius: 4,
            background: "transparent",
            color: "var(--text-primary)",
          }}
        >
          {ZONE_ORDER.map((z) => (
            <option key={z} value={z}>{ZONE_LABELS[z]}</option>
          ))}
        </select>
        <span>Folder:</span>
        <input
          type="text"
          list="media-folder-options"
          value={uploadFolder}
          onChange={(e) => setUploadFolder(e.target.value)}
          placeholder="(root)"
          style={{
            padding: "4px 8px",
            fontSize: "0.75rem",
            fontFamily: "var(--font-mono)",
            border: "1px solid var(--border-subtle, #2a2a2a)",
            borderRadius: 4,
            background: "transparent",
            color: "var(--text-primary)",
            minWidth: 200,
          }}
        />
        <datalist id="media-folder-options">
          {folderList
            .filter(([f]) => f !== "(root)")
            .map(([f]) => (
              <option key={f} value={f} />
            ))}
        </datalist>
      </div>

      <div
        className={`media-page__dropzone${dragOver ? " media-page__dropzone--active" : ""}`}
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => fileInputRef.current?.click()}
      >
        <input ref={fileInputRef} type="file" accept=".jpg,.jpeg,.png,.gif,.webp" onChange={handleFileSelect} hidden />
        <span>{uploading ? "Uploading..." : `Drop image here or click to upload — ${ZONE_LABELS[uploadZone]}`}</span>
      </div>

      {error && <p className="obsv-editor__error">{error}</p>}

      {selectedKeys.size > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 8,
            padding: "8px 12px",
            background: "rgba(58,78,208,0.1)",
            border: "1px solid rgba(58,78,208,0.35)",
            borderRadius: 6,
            fontFamily: "var(--font-ui)",
            fontSize: "0.8125rem",
            color: "var(--text-primary)",
          }}
        >
          <span style={{ fontWeight: 600 }}>{selectedKeys.size} selected</span>
          <button
            type="button"
            className="admin-btn"
            onClick={() => {
              setSelectedKeys(new Set());
              setConfirmingBulkDelete(false);
            }}
          >
            Clear
          </button>
          {confirmingBulkDelete ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
              <span>Delete {selectedKeys.size}?</span>
              <button
                type="button"
                className="admin-btn admin-btn--danger"
                onClick={bulkDelete}
                disabled={bulkDeleting}
              >
                {bulkDeleting ? "Deleting…" : "Yes, delete"}
              </button>
              <button
                type="button"
                className="admin-btn"
                onClick={() => setConfirmingBulkDelete(false)}
                disabled={bulkDeleting}
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="admin-btn admin-btn--danger"
              style={{ marginLeft: "auto" }}
              onClick={() => setConfirmingBulkDelete(true)}
            >
              Delete selected
            </button>
          )}
        </div>
      )}

      <div className="media-page__layout">
        <div className="media-page__grid">
          {loading && <p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>Loading...</p>}
          {!loading && images.length === 0 && <p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>No images uploaded yet.</p>}
          {!loading && images.length > 0 && visibleImages.length === 0 && <p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>No matches.</p>}
          {shownImages.map((img) => {
            const isSelected = selected?.name === img.name && selected?.zone === img.zone;
            const isChecked = selectedKeys.has(keyOf(img));
            return (
              <div
                key={`${img.zone}::${img.name}`}
                className={`media-page__item${isSelected ? " media-page__item--selected" : ""}`}
                onClick={() => selectImage(img)}
                style={{
                  position: "relative",
                  boxShadow: isChecked ? "0 0 0 2px rgba(58,78,208,0.6)" : undefined,
                  borderColor: isChecked ? "#3a4ed0" : undefined,
                }}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => toggleSelect(keyOf(img))}
                  aria-label={`Select ${img.name}`}
                  style={{
                    position: "absolute",
                    top: 4,
                    right: 4,
                    zIndex: 2,
                    width: 18,
                    height: 18,
                    cursor: "pointer",
                    accentColor: "#3a4ed0",
                  }}
                />
                {/* eslint-disable-next-line @next/next/no-img-element -- admin-only thumbnail; dynamic source from blob/Bunny */}
                <img src={img.url} alt={img.alt_text || img.name} className="media-page__thumb" />
                <span
                  style={{
                    position: "absolute",
                    top: 4,
                    left: 4,
                    padding: "2px 6px",
                    fontSize: "0.5625rem",
                    fontFamily: "var(--font-ui)",
                    background: "rgba(0,0,0,0.65)",
                    color: "#fff",
                    borderRadius: 2,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                  }}
                  title={ZONE_LABELS[img.zone]}
                >
                  {img.zone === "site-image" ? "Site" : img.zone === "cover-art" ? "Cover" : "Art"}
                </span>
                {!img.alt_text && <span className="media-page__missing-alt">No alt</span>}
              </div>
            );
          })}
          {hasMore && (
            <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "var(--space-md)" }}>
              <button
                type="button"
                className="admin-btn"
                onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
              >
                Load {Math.min(PAGE_SIZE, visibleImages.length - shownImages.length)} more
                <span style={{ color: "var(--text-tertiary)", marginLeft: 6 }}>
                  · showing {shownImages.length} of {visibleImages.length}
                </span>
              </button>
            </div>
          )}
        </div>

        {selected && (
          <div className="media-page__detail">
            {/* eslint-disable-next-line @next/next/no-img-element -- admin-only preview */}
            <img src={selected.url} alt={editAlt || selected.name} className="media-page__detail-img" />

            <label className="media-page__label" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span>Alt Text <span style={{ color: "#dc2626" }}>*</span></span>
              <button
                type="button"
                onClick={generateAlt}
                disabled={generatingAlt}
                style={{
                  fontSize: "0.6875rem",
                  fontFamily: "var(--font-ui)",
                  padding: "2px 8px",
                  background: "transparent",
                  border: "1px solid var(--text-accent, #3a4ed0)",
                  color: "var(--text-accent, #3a4ed0)",
                  borderRadius: 3,
                  cursor: generatingAlt ? "wait" : "pointer",
                  opacity: generatingAlt ? 0.6 : 1,
                }}
                title="Generate alt text with Claude"
              >
                {generatingAlt ? "Generating..." : "Generate"}
              </button>
            </label>
            <input
              className="obsv-editor__input"
              type="text"
              value={editAlt}
              onChange={(e) => setEditAlt(e.target.value)}
              placeholder="Describe the image"
            />

            <label className="media-page__label">Title</label>
            <input
              className="obsv-editor__input"
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="Image title"
            />

            <div style={{ display: "flex", gap: "8px", marginTop: "var(--space-md)" }}>
              <button className="admin-btn admin-btn--primary" onClick={saveMeta} disabled={saving} type="button">
                {saving ? "Saving..." : "Save"}
              </button>
              <button className="admin-btn" onClick={() => handleMove(selected)} type="button">
                Move…
              </button>
              <button className="admin-btn admin-btn--danger" onClick={() => handleDelete(selected)} type="button">
                Delete
              </button>
            </div>

            <div
              style={{
                marginTop: "var(--space-md)",
                fontFamily: "var(--font-mono)",
                fontSize: "0.6875rem",
                lineHeight: 1.6,
              }}
            >
              <div style={{ color: "var(--text-tertiary)", fontSize: "0.625rem", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "4px" }}>
                Location <span style={{ textTransform: "none", color: "var(--text-tertiary)" }}>(click to copy)</span>
              </div>
              {(() => {
                const parts = selected.name.split("/");
                const filename = parts.pop()!;
                const folders = parts;
                const origin = (() => {
                  try { return new URL(selected.url).origin; } catch { return ""; }
                })();
                const segments: Array<{ label: string; copy: string; key: string }> = [
                  { label: `${origin}/`, copy: `${origin}/`, key: "zone" },
                  ...folders.map((f, i) => ({
                    label: `${f}/`,
                    copy: `${origin}/${folders.slice(0, i + 1).join("/")}/`,
                    key: `folder-${i}`,
                  })),
                  {
                    label: filename,
                    copy: `${origin}/${selected.name}`,
                    key: "file",
                  },
                ];
                return segments.map((seg, i) => (
                  <div
                    key={seg.key}
                    onClick={() => copyValue(seg.key, seg.copy)}
                    style={{
                      paddingLeft: `${i * 14}px`,
                      color: i === segments.length - 1 ? "var(--text-primary)" : "var(--text-secondary)",
                      cursor: "pointer",
                      wordBreak: "break-all",
                      userSelect: "none",
                    }}
                    title={`Copy ${seg.copy}`}
                  >
                    {i > 0 && <span style={{ color: "var(--text-tertiary)" }}>└ </span>}
                    {seg.label}
                    {copiedKey === seg.key && (
                      <span style={{ marginLeft: 6, color: "#33cc55", fontSize: "0.625rem" }}>Copied</span>
                    )}
                  </div>
                ));
              })()}
            </div>
            <input
              className="obsv-editor__input obsv-editor__input--mono"
              type="text"
              value={selected.url}
              readOnly
              onClick={() => copyValue("url", selected.url)}
              style={{ marginTop: "var(--space-sm)", cursor: "pointer" }}
              title="Click to copy URL"
            />
            {copiedKey === "url" && (
              <span style={{ fontSize: "0.625rem", color: "#33cc55", marginLeft: 4 }}>URL copied</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
