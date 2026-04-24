"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface MediaImage {
  name: string;
  url: string;
  alt_text: string;
  title: string;
  zone?: string;
  tokenAuth?: boolean;
}

type UploadZone = "site-image" | "cover-art";

interface MediaLibraryProps {
  open: boolean;
  onClose: () => void;
  onSelect: (url: string, alt?: string, title?: string) => void;
  uploadZone?: UploadZone;
}

export function MediaLibrary({ open, onClose, onSelect, uploadZone = "site-image" }: MediaLibraryProps) {
  const [images, setImages] = useState<MediaImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [selected, setSelected] = useState<MediaImage | null>(null);
  const [editAlt, setEditAlt] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [generatingAlt, setGeneratingAlt] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    const t = setTimeout(() => setSearchTerm(searchInput.trim().toLowerCase()), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  const visibleImages = searchTerm
    ? images.filter((img) => {
        const hay = `${img.name} ${img.alt_text} ${img.title}`.toLowerCase();
        return hay.includes(searchTerm);
      })
    : images;

  const fetchImages = useCallback(async () => {
    setLoading(true);
    setError("");
    const res = await fetch("/api/admin/media");
    if (res.ok) {
      const data = (await res.json()) as MediaImage[];
      // Picker mode: exclude token-auth files — their signed URLs expire and
      // can't be embedded as a permanent reference.
      setImages(data.filter((img) => !img.tokenAuth));
    } else {
      setError("Failed to load images");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) {
      fetchImages();
      setSelected(null);
    }
  }, [open, fetchImages]);

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
      body: JSON.stringify({
        filename: selected.name,
        alt_text: editAlt,
        title: editTitle,
      }),
    });
    // Update local state
    setImages((prev) =>
      prev.map((img) =>
        img.name === selected.name
          ? { ...img, alt_text: editAlt, title: editTitle }
          : img
      )
    );
    setSelected({ ...selected, alt_text: editAlt, title: editTitle });
    setSaving(false);
  }

  function handleInsert() {
    if (!selected) return;
    // Save meta first if changed
    if (editAlt !== selected.alt_text || editTitle !== selected.title) {
      fetch("/api/admin/media", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: selected.name,
          alt_text: editAlt,
          title: editTitle,
        }),
      });
    }
    onSelect(selected.url, editAlt, editTitle);
  }

  async function uploadFile(file: File) {
    setUploading(true);
    setError("");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", uploadZone);

    const res = await fetch("/api/admin/media/upload", {
      method: "POST",
      body: formData,
    });

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

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave() {
    setDragOver(false);
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

  if (!open) return null;

  return (
    <div className="media-overlay" onClick={onClose}>
      <div className="media-modal" onClick={(e) => e.stopPropagation()}>
        <div className="media-modal__header">
          <h2 className="media-modal__title">Media Library</h2>
          <input
            type="search"
            placeholder="Search…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            style={{
              marginLeft: "auto",
              marginRight: 12,
              width: 220,
              padding: "4px 8px",
              fontSize: "0.8125rem",
              fontFamily: "var(--font-ui)",
              border: "1px solid var(--border-subtle, #333)",
              borderRadius: 4,
              background: "transparent",
              color: "var(--text-primary)",
            }}
          />
          <button className="media-modal__close" onClick={onClose} type="button">
            &times;
          </button>
        </div>

        <div className="media-modal__body">
          {/* Left: grid + upload */}
          <div className="media-modal__left">
            <div
              className={`media-modal__dropzone${dragOver ? " media-modal__dropzone--active" : ""}`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.gif,.webp"
                onChange={handleFileSelect}
                hidden
              />
              <span className="media-modal__droptext">
                {uploading ? "Uploading..." : "Drop image here or click to upload"}
              </span>
            </div>

            {error && <p className="media-modal__error">{error}</p>}

            <div className="media-modal__grid">
              {loading && <p className="media-modal__loading">Loading...</p>}
              {!loading && images.length === 0 && (
                <p className="media-modal__empty">No images uploaded yet.</p>
              )}
              {!loading && images.length > 0 && visibleImages.length === 0 && (
                <p className="media-modal__empty">No matches.</p>
              )}
              {visibleImages.map((img) => (
                <div
                  key={img.name}
                  className={`media-modal__item${selected?.name === img.name ? " media-modal__item--selected" : ""}`}
                  onClick={() => selectImage(img)}
                >
                  <img src={img.url} alt={img.alt_text || img.name} className="media-modal__thumb" />
                </div>
              ))}
            </div>
          </div>

          {/* Right: detail panel */}
          {selected && (
            <div className="media-modal__detail">
              <img
                src={selected.url}
                alt={editAlt || selected.name}
                className="media-modal__detail-img"
              />

              <div className="media-modal__detail-fields">
                <label className="media-modal__detail-label" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span>Alt Text <span className="media-modal__required">*</span></span>
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
                  className="media-modal__detail-input"
                  type="text"
                  value={editAlt}
                  onChange={(e) => setEditAlt(e.target.value)}
                  placeholder="Describe the image for SEO and accessibility"
                />

                <label className="media-modal__detail-label">Title</label>
                <input
                  className="media-modal__detail-input"
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Image title for structured data"
                />
              </div>

              <div className="media-modal__detail-actions">
                <button
                  type="button"
                  className="media-modal__save-btn"
                  onClick={saveMeta}
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Save Meta"}
                </button>
                <button
                  type="button"
                  className="media-modal__insert-btn"
                  onClick={handleInsert}
                >
                  Insert Image
                </button>
                <button
                  type="button"
                  className="media-modal__delete-btn"
                  onClick={() => handleDelete(selected.name)}
                >
                  Delete
                </button>
              </div>

              <p className="media-modal__detail-filename">{selected.name}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
