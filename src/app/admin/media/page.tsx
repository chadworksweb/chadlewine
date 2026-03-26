"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface MediaImage {
  name: string;
  url: string;
  alt_text: string;
  title: string;
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchImages = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/media");
    if (res.ok) setImages(await res.json());
    setLoading(false);
  }, []);

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

  async function uploadFile(file: File) {
    setUploading(true);
    setError("");
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/admin/media", { method: "POST", body: formData });
    if (res.ok) {
      await fetchImages();
    } else {
      const data = await res.json();
      setError(data.error || "Upload failed");
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

  async function handleDelete(name: string) {
    if (!confirm("Delete this image?")) return;
    await fetch("/api/admin/media", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (selected?.name === name) setSelected(null);
    fetchImages();
  }

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">Media Library</h1>
        <span style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-sm)", color: "var(--text-tertiary)" }}>
          {images.length} images
        </span>
      </div>

      <div
        className={`media-page__dropzone${dragOver ? " media-page__dropzone--active" : ""}`}
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => fileInputRef.current?.click()}
      >
        <input ref={fileInputRef} type="file" accept=".jpg,.jpeg,.png,.gif,.webp" onChange={handleFileSelect} hidden />
        <span>{uploading ? "Uploading..." : "Drop image here or click to upload"}</span>
      </div>

      {error && <p className="obsv-editor__error">{error}</p>}

      <div className="media-page__layout">
        <div className="media-page__grid">
          {loading && <p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>Loading...</p>}
          {!loading && images.length === 0 && <p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>No images uploaded yet.</p>}
          {images.map((img) => (
            <div
              key={img.name}
              className={`media-page__item${selected?.name === img.name ? " media-page__item--selected" : ""}`}
              onClick={() => selectImage(img)}
            >
              <img src={img.url} alt={img.alt_text || img.name} className="media-page__thumb" />
              {!img.alt_text && <span className="media-page__missing-alt">No alt</span>}
            </div>
          ))}
        </div>

        {selected && (
          <div className="media-page__detail">
            <img src={selected.url} alt={editAlt || selected.name} className="media-page__detail-img" />

            <label className="media-page__label">
              Alt Text <span style={{ color: "#dc2626" }}>*</span>
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
              <button className="admin-btn admin-btn--danger" onClick={() => handleDelete(selected.name)} type="button">
                Delete
              </button>
            </div>

            <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", color: "var(--text-tertiary)", wordBreak: "break-all", marginTop: "var(--space-md)" }}>
              {selected.name}
            </p>
            <input
              className="obsv-editor__input obsv-editor__input--mono"
              type="text"
              value={selected.url}
              readOnly
              onClick={(e) => (e.target as HTMLInputElement).select()}
              style={{ marginTop: "4px" }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
