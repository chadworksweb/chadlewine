"use client";

import { useCallback, useEffect, useState } from "react";
import { slugify } from "@/lib/utils";
import { SkuGalleryPanel } from "@/components/admin/SkuGalleryPanel";
import {
  RELEASE_FORMAT_OPTIONS,
  SKU_STATUS_OPTIONS,
  type ReleaseFormat,
  type SkuStatus,
} from "@/lib/release-labels";

export type SkuKind = "release" | "song";

interface VariantRow {
  id: string;
  release_sku_id: string | null;
  song_sku_id: string | null;
  label: string;
  variant_slug: string;
  sku_code: string | null;
  price_delta: number;
  status: SkuStatus;
  stock: number | null;
  display_order: number;
}

interface SkuRow {
  id: string;
  release_id?: string;
  song_id?: string;
  format: ReleaseFormat;
  fulfillment_method: "manual" | "printify";
  sku_code: string | null;
  price: number | null;
  status: SkuStatus;
  stock: number | null;
  display_order: number;
  download_path_mp3: string | null;
  download_path_flac: string | null;
  download_path_wav: string | null;
  weight_grams: number | null;
  ships_in_days: number | null;
  shipping_first_cents: number | null;
  shipping_addl_cents: number | null;
  printify_product_id: string | null;
  printify_variant_id: string | null;
  variants: VariantRow[];
}

interface Props {
  kind: SkuKind;
  parentId: string;
  parentSlug: string;
}

type DraftSku = Omit<SkuRow, "id" | "variants"> & { id?: string };

function emptyDraft(parentSlug: string): DraftSku {
  const fmt: ReleaseFormat = "digital";
  return {
    format: fmt,
    fulfillment_method: "manual",
    sku_code: parentSlug ? `CL-${parentSlug.toUpperCase()}-${fmt.toUpperCase()}` : null,
    price: null,
    status: "available",
    stock: null,
    display_order: 0,
    download_path_mp3: null,
    download_path_flac: null,
    download_path_wav: null,
    weight_grams: null,
    ships_in_days: null,
    shipping_first_cents: null,
    shipping_addl_cents: null,
    printify_product_id: null,
    printify_variant_id: null,
  };
}

const inputCls = "obsv-editor__input";
const fieldCls = "obsv-editor__field";
const labelCls = "obsv-editor__label";
const monoCls = "obsv-editor__input obsv-editor__input--mono";

export function SkuPanel({ kind, parentId, parentSlug }: Props) {
  const [skus, setSkus] = useState<SkuRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [openSkus, setOpenSkus] = useState<Record<string, boolean>>({});
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<DraftSku>(emptyDraft(parentSlug));

  const listUrl =
    kind === "release"
      ? `/api/admin/releases/${parentId}/skus`
      : `/api/admin/songs/${parentId}/skus`;
  const itemUrl = useCallback(
    (skuId: string) =>
      kind === "release" ? `/api/admin/skus/${skuId}` : `/api/admin/song-skus/${skuId}`,
    [kind],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(listUrl);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || "Failed to load SKUs");
        setLoading(false);
        return;
      }
      const data: SkuRow[] = await res.json();
      setSkus(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load SKUs");
    } finally {
      setLoading(false);
    }
  }, [listUrl]);

  useEffect(() => {
    if (!parentId) return;
    void load();
  }, [parentId, load]);

  function patchSku(id: string, patch: Partial<SkuRow>) {
    setSkus((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  async function saveSku(id: string) {
    const row = skus.find((s) => s.id === id);
    if (!row) return;
    setError(null);
    const res = await fetch(itemUrl(id), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        format: row.format,
        fulfillment_method: row.fulfillment_method,
        sku_code: row.sku_code,
        price: row.price,
        status: row.status,
        stock: row.stock,
        display_order: row.display_order,
        download_path_mp3: row.download_path_mp3,
        download_path_flac: row.download_path_flac,
        download_path_wav: row.download_path_wav,
        weight_grams: row.weight_grams,
        ships_in_days: row.ships_in_days,
        shipping_first_cents: row.shipping_first_cents,
        shipping_addl_cents: row.shipping_addl_cents,
        printify_product_id: row.printify_product_id,
        printify_variant_id: row.printify_variant_id,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Save failed");
    }
  }

  async function deleteSku(id: string) {
    if (!confirm("Delete this format SKU? Existing purchases keep their record but lose the link.")) return;
    const res = await fetch(itemUrl(id), { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Delete failed");
      return;
    }
    setSkus((prev) => prev.filter((s) => s.id !== id));
  }

  async function addSku() {
    setError(null);
    const sku_code =
      draft.sku_code ||
      (parentSlug ? `CL-${parentSlug.toUpperCase()}-${draft.format.toUpperCase()}` : null);
    const res = await fetch(listUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...draft, sku_code }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Create failed");
      return;
    }
    const created: SkuRow = await res.json();
    setSkus((prev) => [...prev, { ...created, variants: created.variants || [] }]);
    setOpenSkus((prev) => ({ ...prev, [created.id]: true }));
    setDraft(emptyDraft(parentSlug));
    setAdding(false);
  }

  async function addVariant(skuId: string) {
    setError(null);
    const body: Record<string, unknown> = {
      label: "New variant",
      variant_slug: "new-variant",
      price_delta: 0,
      status: "available",
      display_order: 0,
    };
    if (kind === "release") body.release_sku_id = skuId;
    else body.song_sku_id = skuId;

    const res = await fetch("/api/admin/sku-variants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error || "Variant create failed");
      return;
    }
    const v: VariantRow = await res.json();
    setSkus((prev) =>
      prev.map((s) => (s.id === skuId ? { ...s, variants: [...s.variants, v] } : s)),
    );
    setExpanded((prev) => ({ ...prev, [skuId]: true }));
  }

  function patchVariant(skuId: string, vid: string, patch: Partial<VariantRow>) {
    setSkus((prev) =>
      prev.map((s) =>
        s.id === skuId
          ? { ...s, variants: s.variants.map((v) => (v.id === vid ? { ...v, ...patch } : v)) }
          : s,
      ),
    );
  }

  async function saveVariant(skuId: string, vid: string) {
    const sku = skus.find((s) => s.id === skuId);
    const v = sku?.variants.find((x) => x.id === vid);
    if (!v) return;
    setError(null);
    const res = await fetch(`/api/admin/sku-variants/${vid}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: v.label,
        variant_slug: v.variant_slug || slugify(v.label || ""),
        sku_code: v.sku_code,
        price_delta: v.price_delta,
        status: v.status,
        stock: v.stock,
        display_order: v.display_order,
      }),
    });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error || "Variant save failed");
    }
  }

  async function deleteVariant(skuId: string, vid: string) {
    if (!confirm("Delete this variant?")) return;
    const res = await fetch(`/api/admin/sku-variants/${vid}`, { method: "DELETE" });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error || "Variant delete failed");
      return;
    }
    setSkus((prev) =>
      prev.map((s) =>
        s.id === skuId ? { ...s, variants: s.variants.filter((v) => v.id !== vid) } : s,
      ),
    );
  }

  if (!parentId) return null;
  if (loading) {
    return (
      <div className="obsv-editor__panel">
        <h3 className="obsv-editor__panel-title">Formats (SKUs)</h3>
        <p style={{ fontFamily: "var(--font-ui)", fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
          Loading...
        </p>
      </div>
    );
  }

  return (
    <div className="obsv-editor__panel">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-sm)" }}>
        <h3 className="obsv-editor__panel-title" style={{ margin: 0 }}>Formats (SKUs)</h3>
        <button
          type="button"
          className="admin-btn"
          onClick={() => setAdding((v) => !v)}
          style={{ fontSize: "0.75rem", padding: "4px 12px" }}
        >
          {adding ? "Cancel" : "+ Add Format"}
        </button>
      </div>

      {error && (
        <p style={{ color: "#ff3333", fontFamily: "var(--font-ui)", fontSize: "0.75rem", margin: "0 0 var(--space-sm)" }}>
          {error}
        </p>
      )}

      {adding && (
        <div
          style={{
            border: "1px solid var(--border-subtle, rgba(255,255,255,0.08))",
            padding: "var(--space-sm)",
            marginBottom: "var(--space-sm)",
            borderRadius: 4,
          }}
        >
          <SkuFormFields
            row={draft}
            onChange={(p) =>
              setDraft((prev) => {
                const next = { ...prev, ...p };
                // Keep sku_code in sync with format until user types one in.
                if (
                  "format" in p &&
                  parentSlug &&
                  (!prev.sku_code || prev.sku_code === `CL-${parentSlug.toUpperCase()}-${prev.format.toUpperCase()}`)
                ) {
                  next.sku_code = `CL-${parentSlug.toUpperCase()}-${(p.format as string).toUpperCase()}`;
                }
                return next;
              })
            }
          />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button type="button" className="admin-btn admin-btn--primary" onClick={addSku} style={{ fontSize: "0.75rem", padding: "4px 12px" }}>
              Create
            </button>
            <button type="button" className="admin-btn" onClick={() => { setAdding(false); setDraft(emptyDraft(parentSlug)); }} style={{ fontSize: "0.75rem", padding: "4px 12px" }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {skus.length === 0 && !adding && (
        <p style={{ fontFamily: "var(--font-ui)", fontSize: "0.75rem", color: "var(--text-tertiary)", margin: 0 }}>
          No formats yet. Add one to make this {kind} purchasable.
        </p>
      )}

      {skus.map((sku) => {
        const open = !!expanded[sku.id];
        const isOpen = !!openSkus[sku.id];
        return (
          <div
            key={sku.id}
            style={{
              border: "1px solid var(--border-subtle, rgba(255,255,255,0.08))",
              borderRadius: 4,
              marginBottom: "var(--space-sm)",
              overflow: "hidden",
            }}
          >
            <button
              type="button"
              onClick={() => setOpenSkus((p) => ({ ...p, [sku.id]: !isOpen }))}
              aria-expanded={isOpen}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                width: "100%",
                padding: "var(--space-sm)",
                background: isOpen ? "rgba(255,255,255,0.03)" : "transparent",
                border: 0,
                borderBottom: isOpen
                  ? "1px solid var(--border-subtle, rgba(255,255,255,0.08))"
                  : "0",
                color: "inherit",
                cursor: "pointer",
                fontFamily: "var(--font-ui)",
                fontSize: "0.8rem",
                textAlign: "left",
              }}
            >
              <span style={{ width: 12, color: "var(--text-tertiary)", fontFamily: "var(--td-font-mono, monospace)" }}>
                {isOpen ? "v" : ">"}
              </span>
              <span style={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                {RELEASE_FORMAT_OPTIONS.find((o) => o.value === sku.format)?.label || sku.format}
              </span>
              <span style={{ color: "var(--text-tertiary)" }}>
                {sku.price !== null ? `$${Number(sku.price).toFixed(2)}` : "no price"}
              </span>
              <span style={{ color: "var(--text-tertiary)" }}>
                {SKU_STATUS_OPTIONS.find((o) => o.value === sku.status)?.label || sku.status}
              </span>
              {sku.variants.length > 0 && (
                <span style={{ color: "var(--text-tertiary)" }}>
                  {sku.variants.length} {sku.variants.length === 1 ? "variant" : "variants"}
                </span>
              )}
              {sku.sku_code && (
                <span style={{ marginLeft: "auto", color: "var(--text-tertiary)", fontFamily: "var(--td-font-mono, monospace)", fontSize: "0.7rem" }}>
                  {sku.sku_code}
                </span>
              )}
            </button>

            {isOpen && (
              <div style={{ padding: "var(--space-sm)" }}>
                <SkuFormFields
                  row={sku}
                  onChange={(p) => patchSku(sku.id, p)}
                  onBlurSave={() => saveSku(sku.id)}
                />

                <div style={{ marginTop: 12 }}>
                  <SkuGalleryPanel
                    skuId={sku.id}
                    kind={kind}
                    uploadFolder={parentSlug ? `sku-galleries/${parentSlug}/${sku.format}` : "sku-galleries"}
                  />
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <button type="button" className="admin-btn" onClick={() => saveSku(sku.id)} style={{ fontSize: "0.6875rem", padding: "4px 10px" }}>
                    Save
                  </button>
                  <button type="button" className="admin-btn admin-btn--danger" onClick={() => deleteSku(sku.id)} style={{ fontSize: "0.6875rem", padding: "4px 10px" }}>
                    Delete
                  </button>
                  <button
                    type="button"
                    className="admin-btn"
                    onClick={() => setExpanded((p) => ({ ...p, [sku.id]: !open }))}
                    style={{ fontSize: "0.6875rem", padding: "4px 10px", marginLeft: "auto" }}
                  >
                    Variants ({sku.variants.length}) {open ? "v" : ">"}
                  </button>
                </div>

                {open && (
                  <div style={{ marginTop: "var(--space-sm)", paddingTop: "var(--space-sm)", borderTop: "1px dashed var(--border-subtle, rgba(255,255,255,0.08))" }}>
                    {sku.variants.length === 0 && (
                      <p style={{ fontFamily: "var(--font-ui)", fontSize: "0.7rem", color: "var(--text-tertiary)", margin: "0 0 var(--space-xs)" }}>
                        No variants. Use these for color, signed, size, etc.
                      </p>
                    )}
                    {sku.variants.map((v) => (
                      <VariantRowEditor
                        key={v.id}
                        row={v}
                        onChange={(p) => {
                          patchVariant(sku.id, v.id, p);
                        }}
                        onAutoSlug={() =>
                          patchVariant(sku.id, v.id, { variant_slug: slugify(v.label || "") })
                        }
                        onSave={() => saveVariant(sku.id, v.id)}
                        onDelete={() => deleteVariant(sku.id, v.id)}
                      />
                    ))}
                    <button
                      type="button"
                      className="admin-btn"
                      onClick={() => addVariant(sku.id)}
                      style={{ fontSize: "0.6875rem", padding: "4px 10px", marginTop: 4 }}
                    >
                      + Add Variant
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SkuFormFields({
  row,
  onChange,
  onBlurSave,
}: {
  row: DraftSku | SkuRow;
  onChange: (patch: Partial<SkuRow>) => void;
  onBlurSave?: () => void;
}) {
  const isDigital = row.format === "digital";
  const isPrintify = row.fulfillment_method === "printify";

  return (
    <>
      <div className="obsv-editor__field-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div className={fieldCls}>
          <label className={labelCls}>Format</label>
          <select
            className={inputCls}
            value={row.format}
            onChange={(e) => onChange({ format: e.target.value as ReleaseFormat })}
            onBlur={onBlurSave}
          >
            {RELEASE_FORMAT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className={fieldCls}>
          <label className={labelCls}>Status</label>
          <select
            className={inputCls}
            value={row.status}
            onChange={(e) => onChange({ status: e.target.value as SkuStatus })}
            onBlur={onBlurSave}
          >
            {SKU_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className={fieldCls}>
          <label className={labelCls}>Fulfillment</label>
          <select
            className={inputCls}
            value={row.fulfillment_method}
            onChange={(e) => onChange({ fulfillment_method: e.target.value as "manual" | "printify" })}
            onBlur={onBlurSave}
          >
            <option value="manual">Manual</option>
            <option value="printify">Printify</option>
          </select>
        </div>
        <div className={fieldCls}>
          <label className={labelCls}>Display order</label>
          <input
            type="number"
            className={inputCls}
            value={row.display_order}
            onChange={(e) => onChange({ display_order: parseInt(e.target.value) || 0 })}
            onBlur={onBlurSave}
          />
        </div>
        <div className={fieldCls} style={{ gridColumn: "1 / -1" }}>
          <label className={labelCls}>SKU code</label>
          <input
            type="text"
            className={monoCls}
            value={row.sku_code || ""}
            onChange={(e) => onChange({ sku_code: e.target.value || null })}
            onBlur={onBlurSave}
            placeholder="auto-default on save"
          />
        </div>
        <div className={fieldCls}>
          <label className={labelCls}>Price ($)</label>
          <input
            type="number"
            step="0.01"
            min={0}
            className={inputCls}
            value={row.price ?? ""}
            onChange={(e) => onChange({ price: e.target.value ? parseFloat(e.target.value) : null })}
            onBlur={onBlurSave}
            placeholder="0.00"
          />
        </div>
        <div className={fieldCls}>
          <label className={labelCls}>Stock (blank = unlimited)</label>
          <input
            type="number"
            min={0}
            className={inputCls}
            value={row.stock ?? ""}
            onChange={(e) => onChange({ stock: e.target.value ? parseInt(e.target.value) : null })}
            onBlur={onBlurSave}
          />
        </div>
      </div>

      {isDigital && (
        <div style={{ marginTop: 8 }}>
          <div className={fieldCls}>
            <label className={labelCls}>MP3 download path</label>
            <input
              type="text"
              className={monoCls}
              value={row.download_path_mp3 || ""}
              onChange={(e) => onChange({ download_path_mp3: e.target.value || null })}
              onBlur={onBlurSave}
              placeholder="https://cdn.bunny.net/...mp3.zip"
            />
          </div>
          <div className={fieldCls}>
            <label className={labelCls}>FLAC download path</label>
            <input
              type="text"
              className={monoCls}
              value={row.download_path_flac || ""}
              onChange={(e) => onChange({ download_path_flac: e.target.value || null })}
              onBlur={onBlurSave}
              placeholder="https://cdn.bunny.net/...flac.zip"
            />
          </div>
          <div className={fieldCls}>
            <label className={labelCls}>WAV download path</label>
            <input
              type="text"
              className={monoCls}
              value={row.download_path_wav || ""}
              onChange={(e) => onChange({ download_path_wav: e.target.value || null })}
              onBlur={onBlurSave}
              placeholder="https://cdn.bunny.net/...wav.zip"
            />
          </div>
        </div>
      )}

      {!isDigital && (
        <div className="obsv-editor__field-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
          <div className={fieldCls}>
            <label className={labelCls}>Weight (grams)</label>
            <input
              type="number"
              min={0}
              className={inputCls}
              value={row.weight_grams ?? ""}
              onChange={(e) => onChange({ weight_grams: e.target.value ? parseInt(e.target.value) : null })}
              onBlur={onBlurSave}
            />
          </div>
          <div className={fieldCls}>
            <label className={labelCls}>Ships in (days)</label>
            <input
              type="number"
              min={0}
              className={inputCls}
              value={row.ships_in_days ?? ""}
              onChange={(e) => onChange({ ships_in_days: e.target.value ? parseInt(e.target.value) : null })}
              onBlur={onBlurSave}
            />
          </div>
        </div>
      )}

      {!isDigital && !isPrintify && (
        <div className="obsv-editor__field-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
          <div className={fieldCls}>
            <label className={labelCls}>Shipping: first item ($)</label>
            <input
              type="number"
              min={0}
              step="0.01"
              className={inputCls}
              value={row.shipping_first_cents != null ? (row.shipping_first_cents / 100).toString() : ""}
              onChange={(e) =>
                onChange({ shipping_first_cents: e.target.value ? Math.round(parseFloat(e.target.value) * 100) : null })
              }
              onBlur={onBlurSave}
              placeholder="e.g. 6.00"
            />
          </div>
          <div className={fieldCls}>
            <label className={labelCls}>Shipping: each additional ($)</label>
            <input
              type="number"
              min={0}
              step="0.01"
              className={inputCls}
              value={row.shipping_addl_cents != null ? (row.shipping_addl_cents / 100).toString() : ""}
              onChange={(e) =>
                onChange({ shipping_addl_cents: e.target.value ? Math.round(parseFloat(e.target.value) * 100) : null })
              }
              onBlur={onBlurSave}
              placeholder="e.g. 2.00"
            />
          </div>
        </div>
      )}

      {isPrintify && (
        <div className="obsv-editor__field-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
          <div className={fieldCls}>
            <label className={labelCls}>Printify product ID</label>
            <input
              type="text"
              className={monoCls}
              value={row.printify_product_id || ""}
              onChange={(e) => onChange({ printify_product_id: e.target.value || null })}
              onBlur={onBlurSave}
            />
          </div>
          <div className={fieldCls}>
            <label className={labelCls}>Printify variant ID</label>
            <input
              type="text"
              className={monoCls}
              value={row.printify_variant_id || ""}
              onChange={(e) => onChange({ printify_variant_id: e.target.value || null })}
              onBlur={onBlurSave}
            />
          </div>
        </div>
      )}

    </>
  );
}


function VariantRowEditor({
  row,
  onChange,
  onAutoSlug,
  onSave,
  onDelete,
}: {
  row: VariantRow;
  onChange: (patch: Partial<VariantRow>) => void;
  onAutoSlug: () => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "2fr 2fr 1fr 1fr 1fr 1fr auto",
        gap: 6,
        alignItems: "end",
        marginBottom: 6,
      }}
    >
      <div className={fieldCls}>
        <label className={labelCls} style={{ fontSize: "0.625rem" }}>Label</label>
        <input
          type="text"
          className={inputCls}
          value={row.label}
          onChange={(e) => onChange({ label: e.target.value })}
          onBlur={() => {
            if (!row.variant_slug) onAutoSlug();
            onSave();
          }}
        />
      </div>
      <div className={fieldCls}>
        <label className={labelCls} style={{ fontSize: "0.625rem" }}>Slug</label>
        <input
          type="text"
          className={monoCls}
          value={row.variant_slug}
          onChange={(e) => onChange({ variant_slug: e.target.value })}
          onBlur={onSave}
        />
      </div>
      <div className={fieldCls}>
        <label className={labelCls} style={{ fontSize: "0.625rem" }}>Price Δ</label>
        <input
          type="number"
          step="0.01"
          className={inputCls}
          value={row.price_delta}
          onChange={(e) => onChange({ price_delta: parseFloat(e.target.value) || 0 })}
          onBlur={onSave}
        />
      </div>
      <div className={fieldCls}>
        <label className={labelCls} style={{ fontSize: "0.625rem" }}>Stock</label>
        <input
          type="number"
          className={inputCls}
          value={row.stock ?? ""}
          onChange={(e) => onChange({ stock: e.target.value ? parseInt(e.target.value) : null })}
          onBlur={onSave}
        />
      </div>
      <div className={fieldCls}>
        <label className={labelCls} style={{ fontSize: "0.625rem" }}>Status</label>
        <select
          className={inputCls}
          value={row.status}
          onChange={(e) => onChange({ status: e.target.value as SkuStatus })}
          onBlur={onSave}
        >
          {SKU_STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      <div className={fieldCls}>
        <label className={labelCls} style={{ fontSize: "0.625rem" }}>Order</label>
        <input
          type="number"
          className={inputCls}
          value={row.display_order}
          onChange={(e) => onChange({ display_order: parseInt(e.target.value) || 0 })}
          onBlur={onSave}
        />
      </div>
      <button
        type="button"
        className="admin-btn admin-btn--danger"
        onClick={onDelete}
        style={{ fontSize: "0.625rem", padding: "4px 8px" }}
        aria-label="Delete variant"
      >
        x
      </button>
    </div>
  );
}
