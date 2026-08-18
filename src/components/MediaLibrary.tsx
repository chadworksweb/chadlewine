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
  // Optional folder for uploads done from inside the modal. Picker still shows
  // every file in the zone regardless of folder.
  uploadFolder?: string;
}

export function MediaLibrary({ open, onClose, onSelect, uploadZone = "site-image", uploadFolder }: MediaLibraryProps) {
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
  const [visibleCount, setVisibleCount] = useState(20);
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set());
  const [confirmingBulkDelete, setConfirmingBulkDelete] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const PAGE_SIZE = 20;

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

  // Reset paging window when the search changes or the modal reopens —
  // adjusts during render only when the trigger values actually change.
  const [lastSearchTerm, setLastSearchTerm] = useState(searchTerm);
  const [lastOpen, setLastOpen] = useState(open);
  if (searchTerm !== lastSearchTerm || open !== lastOpen) {
    setLastSearchTerm(searchTerm);
    setLastOpen(open);
    setVisibleCount(PAGE_SIZE);
  }

  const matchingImages = searchTerm
    ? images.filter((img) => {
        const hay = `${img.name} ${img.alt_text} ${img.title}`.toLowerCase();
        return hay.includes(searchTerm);
      })
    : images;
  const visibleImages = matchingImages.slice(0, visibleCount);
  const hasMore = matchingImages.length > visibleImages.length;

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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- load images when modal opens
      fetchImages();
      setSelected(null);
      setSelectedNames(new Set());
      setConfirmingBulkDelete(false);
    }
  }, [open, fetchImages]);

  function toggleSelect(name: string) {
    setConfirmingBulkDelete(false);
    setSelectedNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  async function bulkDelete() {
    if (selectedNames.size === 0) return;
    setBulkDeleting(true);
    const targets = images.filter((img) => selectedNames.has(img.name));
    await Promise.all(
      targets.map((img) =>
        fetch("/api/admin/media", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: img.name, zone: img.zone }),
        }),
      ),
    );
    if (selected && selectedNames.has(selected.name)) setSelected(null);
    setSelectedNames(new Set());
    setConfirmingBulkDelete(false);
    setBulkDeleting(false);
    fetchImages();
  }

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
    if (uploadFolder) formData.append("folder", uploadFolder);

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

  async function handleDelete(name: string, zone?: string) {
    if (!confirm("Delete this image?")) return;
    await fetch("/api/admin/media", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, zone }),
    });
    if (selected?.name === name) setSelected(null);
    fetchImages();
  }

  if (!open) return null;

  return (
    <div className="media-overlay">
      <div className="media-modal">
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

            {selectedNames.size > 0 && (
              <div className="media-modal__bulkbar">
                <span className="media-modal__bulkcount">
                  {selectedNames.size} selected
                </span>
                <button
                  type="button"
                  className="media-modal__bulk-clear"
                  onClick={() => {
                    setSelectedNames(new Set());
                    setConfirmingBulkDelete(false);
                  }}
                >
                  Clear
                </button>
                {confirmingBulkDelete ? (
                  <span className="media-modal__bulk-confirm">
                    <span>Delete {selectedNames.size}?</span>
                    <button
                      type="button"
                      className="media-modal__bulk-delete"
                      onClick={bulkDelete}
                      disabled={bulkDeleting}
                    >
                      {bulkDeleting ? "Deleting…" : "Yes, delete"}
                    </button>
                    <button
                      type="button"
                      className="media-modal__bulk-cancel"
                      onClick={() => setConfirmingBulkDelete(false)}
                      disabled={bulkDeleting}
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="media-modal__bulk-delete"
                    onClick={() => setConfirmingBulkDelete(true)}
                  >
                    Delete selected
                  </button>
                )}
              </div>
            )}

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
                  className={`media-modal__item${selected?.name === img.name ? " media-modal__item--selected" : ""}${selectedNames.has(img.name) ? " media-modal__item--checked" : ""}`}
                  onClick={() => selectImage(img)}
                >
                  <input
                    type="checkbox"
                    className="media-modal__check"
                    checked={selectedNames.has(img.name)}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => toggleSelect(img.name)}
                    aria-label={`Select ${img.name}`}
                  />
                  {/* eslint-disable-next-line @next/next/no-img-element -- admin-only library tile */}
                  <img src={img.url} alt={img.alt_text || img.name} className="media-modal__thumb" loading="lazy" />
                </div>
              ))}
            </div>

            {hasMore && (
              <div className="media-modal__more">
                <button
                  type="button"
                  className="media-modal__more-btn"
                  onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                >
                  Load {Math.min(PAGE_SIZE, matchingImages.length - visibleImages.length)} more
                  <span className="media-modal__more-count"> · showing {visibleImages.length} of {matchingImages.length}</span>
                </button>
              </div>
            )}
          </div>

          {/* Right: detail panel */}
          {selected && (
            <div className="media-modal__detail">
              {/* eslint-disable-next-line @next/next/no-img-element -- admin-only detail preview */}
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
                  onClick={() => handleDelete(selected.name, selected.zone)}
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
