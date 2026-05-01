"use client";

import { useEffect, useRef, useState } from "react";
import { MediaLibrary } from "@/components/MediaLibrary";

interface ProductImageRow {
  id: string;
  product_id: string;
  url: string;
  source: "printify" | "custom";
  position: number;
  is_primary: boolean;
  is_hidden: boolean;
  needs_review: boolean;
  alt: string | null;
  printify_position: string | null;
}

interface Props {
  productId: string;
  fulfillment: string;
  slug?: string | null;
}

export function MerchGalleryPanel({ productId, fulfillment, slug }: Props) {
  const uploadFolder = slug ? `merch/${slug}` : undefined;
  const [images, setImages] = useState<ProductImageRow[] | null>(null);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const dragIdRef = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const isManual = fulfillment === "manual";

  async function load() {
    try {
      const r = await fetch(`/api/admin/merch/images?product_id=${productId}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Load failed");
      setImages(d.images);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => { load(); }, [productId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function patch(id: string, body: Record<string, unknown>) {
    const r = await fetch(`/api/admin/merch/images/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const d = await r.json();
      setError(d.error || "Update failed");
      return;
    }
    await load();
  }

  async function softDelete(id: string) {
    if (!confirm("Remove this image from the gallery? Custom images are recoverable for 30 days.")) return;
    const r = await fetch(`/api/admin/merch/images/${id}`, { method: "DELETE" });
    if (!r.ok) {
      const d = await r.json();
      setError(d.error || "Delete failed");
      return;
    }
    await load();
  }

  async function reorder(orderedIds: string[]) {
    const r = await fetch(`/api/admin/merch/images/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_id: productId, ordered_ids: orderedIds }),
    });
    if (!r.ok) {
      const d = await r.json();
      setError(d.error || "Reorder failed");
      return;
    }
    await load();
  }

  async function handleMediaSelect(url: string, alt?: string) {
    setPickerOpen(false);
    setAdding(true);
    setError("");
    try {
      const r = await fetch(`/api/admin/merch/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: productId, url, alt: alt || null }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Add failed");
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAdding(false);
    }
  }

  function handleDragStart(id: string) {
    dragIdRef.current = id;
  }
  function handleDragOver(e: React.DragEvent, id: string) {
    e.preventDefault();
    if (dragIdRef.current && dragIdRef.current !== id) setDragOverId(id);
  }
  function handleDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    const sourceId = dragIdRef.current;
    dragIdRef.current = null;
    setDragOverId(null);
    if (!sourceId || !images || sourceId === targetId) return;
    const next = [...images];
    const fromIdx = next.findIndex((i) => i.id === sourceId);
    const toIdx = next.findIndex((i) => i.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    setImages(next);
    void reorder(next.map((i) => i.id));
  }

  const reviewCount = images?.filter((i) => i.needs_review && !i.is_hidden).length ?? 0;

  if (images === null) {
    return (
      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Gallery</label>
        <p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>Loading…</p>
      </div>
    );
  }

  return (
    <div className="obsv-editor__field">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <label className="obsv-editor__label" style={{ margin: 0 }}>
          Gallery {images.length > 0 && <span style={{ color: "var(--text-tertiary)" }}>({images.length})</span>}
          {!isManual && reviewCount > 0 && (
            <span style={{
              marginLeft: 8,
              padding: "2px 8px",
              background: "var(--accent, #ffb627)",
              color: "#000",
              borderRadius: 10,
              fontSize: 12,
            }}>
              {reviewCount} new from Printify
            </span>
          )}
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className="admin-btn admin-btn--secondary"
            onClick={() => setPickerOpen(true)}
            disabled={adding}
          >
            {adding ? "Adding..." : "Add image"}
          </button>
        </div>
      </div>

      <MediaLibrary
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handleMediaSelect}
        uploadZone="site-image"
        uploadFolder={uploadFolder}
      />

      {error && <p className="obsv-editor__error">{error}</p>}

      {images.length === 0 && (
        <p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>
          No images yet. {isManual ? "Upload one to get started." : "Sync from Printify or upload a custom image."}
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {images.map((img) => {
          const isOver = dragOverId === img.id;
          return (
            <div
              key={img.id}
              draggable
              onDragStart={() => handleDragStart(img.id)}
              onDragOver={(e) => handleDragOver(e, img.id)}
              onDrop={(e) => handleDrop(e, img.id)}
              onDragEnd={() => { dragIdRef.current = null; setDragOverId(null); }}
              style={{
                display: "grid",
                gridTemplateColumns: "auto 80px 1fr auto",
                alignItems: "center",
                gap: 12,
                padding: 8,
                border: `1px solid ${isOver ? "var(--accent, #ffb627)" : "var(--border, #333)"}`,
                borderRadius: 6,
                background: img.is_hidden ? "rgba(0,0,0,0.04)" : "transparent",
                opacity: img.is_hidden ? 0.55 : 1,
                cursor: "grab",
              }}
            >
              <span style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)", fontSize: 14 }}>⋮⋮</span>

              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.url}
                alt={img.alt || ""}
                style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 4, background: "#222" }}
              />

              <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  {!isManual && (
                    <span style={{
                      fontSize: 11,
                      padding: "2px 6px",
                      borderRadius: 3,
                      background: img.source === "printify" ? "#1a4d8f" : "#4a7d2a",
                      color: "#fff",
                      fontFamily: "var(--font-ui)",
                    }}>
                      {img.source === "printify" ? "Printify" : "Custom"}
                    </span>
                  )}
                  {img.is_primary && (
                    <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 3, background: "#a37800", color: "#fff", fontFamily: "var(--font-ui)" }}>
                      Primary
                    </span>
                  )}
                  {img.printify_position && (
                    <span style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>
                      {img.printify_position}
                    </span>
                  )}
                  {img.needs_review && !img.is_hidden && (
                    <button
                      type="button"
                      onClick={() => patch(img.id, { needs_review: false })}
                      style={{
                        fontSize: 11,
                        padding: "2px 6px",
                        borderRadius: 3,
                        background: "var(--accent, #ffb627)",
                        color: "#000",
                        border: "none",
                        cursor: "pointer",
                        fontFamily: "var(--font-ui)",
                      }}
                    >
                      Review · click to clear
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  className="obsv-editor__input"
                  defaultValue={img.alt || ""}
                  placeholder="Alt text"
                  onBlur={(e) => {
                    const next = e.target.value;
                    if (next !== (img.alt || "")) {
                      void patch(img.id, { alt: next || null });
                    }
                  }}
                  style={{ fontSize: 13, padding: "4px 8px" }}
                />
              </div>

              <div style={{ display: "flex", gap: 4 }}>
                <button
                  type="button"
                  title={img.is_primary ? "Primary image" : "Set as primary"}
                  onClick={() => !img.is_primary && patch(img.id, { is_primary: true })}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: img.is_primary ? "default" : "pointer",
                    fontSize: 18,
                    color: img.is_primary ? "#ffb627" : "var(--text-tertiary)",
                  }}
                >
                  {img.is_primary ? "★" : "☆"}
                </button>
                <button
                  type="button"
                  title={img.is_hidden ? "Show in gallery" : "Hide from gallery"}
                  onClick={() => patch(img.id, { is_hidden: !img.is_hidden })}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 16,
                    color: "var(--text-tertiary)",
                  }}
                >
                  {img.is_hidden ? "🚫" : "👁"}
                </button>
                {img.source === "custom" && (
                  <button
                    type="button"
                    title="Remove (recoverable for 30 days)"
                    onClick={() => softDelete(img.id)}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontSize: 16,
                      color: "var(--text-tertiary)",
                    }}
                  >
                    🗑
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
