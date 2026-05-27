"use client";

import { useCallback, useEffect, useState } from "react";
import { slugify } from "@/lib/utils";

// art_skus admin panel. Parallel to SkuPanel (song/release) but for art:
// formats are original | limited_print, each SKU carries a sale_mode (buy_now |
// inquire), edition counters, and a COA flag. Framing/substrate options live in
// sku_variants under art_sku_id. No digital download fields -- art is physical.

type ArtFormat = "original" | "limited_print";
type ArtStatus = "available" | "reserved" | "sold" | "preorder" | "discontinued";
type SaleMode = "buy_now" | "inquire";

const FORMAT_OPTIONS: { value: ArtFormat; label: string }[] = [
  { value: "original", label: "Original (1 of 1)" },
  { value: "limited_print", label: "Limited print" },
];
const STATUS_OPTIONS: { value: ArtStatus; label: string }[] = [
  { value: "available", label: "Available" },
  { value: "reserved", label: "Reserved" },
  { value: "sold", label: "Sold" },
  { value: "preorder", label: "Preorder" },
  { value: "discontinued", label: "Discontinued" },
];

interface VariantRow {
  id: string;
  art_sku_id: string | null;
  label: string;
  variant_slug: string;
  sku_code: string | null;
  price_delta: number;
  status: ArtStatus;
  stock: number | null;
  display_order: number;
}

interface SkuRow {
  id: string;
  art_id?: string;
  format: ArtFormat;
  fulfillment_method: "manual" | "printify";
  sale_mode: SaleMode;
  sku_code: string | null;
  price: number | null;
  status: ArtStatus;
  stock: number | null;
  edition_size: number;
  editions_sold: number;
  coa_enabled: boolean;
  weight_grams: number | null;
  ships_in_days: number | null;
  shipping_first_cents: number | null;
  shipping_addl_cents: number | null;
  shipping_ca_first_cents: number | null;
  shipping_ca_addl_cents: number | null;
  shipping_uk_first_cents: number | null;
  shipping_uk_addl_cents: number | null;
  shipping_row_first_cents: number | null;
  shipping_row_addl_cents: number | null;
  free_shipping_exempt: boolean;
  printify_product_id: string | null;
  printify_variant_id: string | null;
  display_order: number;
  variants: VariantRow[];
}

type DraftSku = Omit<SkuRow, "id" | "variants"> & { id?: string };

function skuCodeFor(slug: string, fmt: ArtFormat): string | null {
  if (!slug) return null;
  return `CL-${slug.toUpperCase()}-${fmt === "original" ? "ORIGINAL" : "PRINT"}`;
}

function emptyDraft(parentSlug: string): DraftSku {
  const fmt: ArtFormat = "original";
  return {
    format: fmt,
    fulfillment_method: "manual",
    sale_mode: "buy_now",
    sku_code: skuCodeFor(parentSlug, fmt),
    price: null,
    status: "available",
    stock: null,
    edition_size: 1,
    editions_sold: 0,
    coa_enabled: true,
    weight_grams: null,
    ships_in_days: null,
    shipping_first_cents: null,
    shipping_addl_cents: null,
    shipping_ca_first_cents: null,
    shipping_ca_addl_cents: null,
    shipping_uk_first_cents: null,
    shipping_uk_addl_cents: null,
    shipping_row_first_cents: null,
    shipping_row_addl_cents: null,
    free_shipping_exempt: false,
    printify_product_id: null,
    printify_variant_id: null,
    display_order: 0,
  };
}

const inputCls = "obsv-editor__input";
const fieldCls = "obsv-editor__field";
const labelCls = "obsv-editor__label";
const monoCls = "obsv-editor__input obsv-editor__input--mono";

export function ArtSkuPanel({ slug }: { slug: string }) {
  const [skus, setSkus] = useState<SkuRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openSkus, setOpenSkus] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<DraftSku>(emptyDraft(slug));

  const listUrl = `/api/admin/art/${slug}/skus`;
  const itemUrl = useCallback((id: string) => `/api/admin/art-skus/${id}`, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(listUrl);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || "Failed to load SKUs");
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
    if (!slug) return;
    void load();
  }, [slug, load]);

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
      body: JSON.stringify(serializeSku(row)),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Save failed");
      return;
    }
    const saved: SkuRow = await res.json();
    // Server forces edition_size=1 on originals; reflect any normalization.
    patchSku(id, { edition_size: saved.edition_size, sku_code: saved.sku_code });
  }

  async function deleteSku(id: string) {
    if (!confirm("Delete this SKU? Existing purchases keep their record but lose the link.")) return;
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
    const sku_code = draft.sku_code || skuCodeFor(slug, draft.format);
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
    setDraft(emptyDraft(slug));
    setAdding(false);
  }

  async function addVariant(skuId: string) {
    setError(null);
    const res = await fetch("/api/admin/sku-variants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        art_sku_id: skuId,
        label: "Unframed",
        variant_slug: "unframed",
        price_delta: 0,
        status: "available",
        display_order: 0,
      }),
    });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error || "Variant create failed");
      return;
    }
    const v: VariantRow = await res.json();
    setSkus((prev) => prev.map((s) => (s.id === skuId ? { ...s, variants: [...s.variants, v] } : s)));
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
    const v = skus.find((s) => s.id === skuId)?.variants.find((x) => x.id === vid);
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
      prev.map((s) => (s.id === skuId ? { ...s, variants: s.variants.filter((v) => v.id !== vid) } : s)),
    );
  }

  if (!slug) return null;
  if (loading) {
    return (
      <div className="obsv-editor__panel">
        <h3 className="obsv-editor__panel-title">Editions (SKUs)</h3>
        <p style={{ fontFamily: "var(--font-ui)", fontSize: "0.75rem", color: "var(--text-tertiary)" }}>Loading...</p>
      </div>
    );
  }

  return (
    <div className="obsv-editor__panel">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-sm)" }}>
        <h3 className="obsv-editor__panel-title" style={{ margin: 0 }}>Editions (SKUs)</h3>
        <button type="button" className="admin-btn" onClick={() => setAdding((v) => !v)} style={{ fontSize: "0.75rem", padding: "4px 12px" }}>
          {adding ? "Cancel" : "+ Add Edition"}
        </button>
      </div>

      {error && (
        <p style={{ color: "#ff3333", fontFamily: "var(--font-ui)", fontSize: "0.75rem", margin: "0 0 var(--space-sm)" }}>{error}</p>
      )}

      {adding && (
        <div style={{ border: "1px solid var(--border-subtle, rgba(255,255,255,0.08))", padding: "var(--space-sm)", marginBottom: "var(--space-sm)", borderRadius: 4 }}>
          <ArtSkuFields
            row={draft}
            onChange={(p) =>
              setDraft((prev) => {
                const next = { ...prev, ...p };
                if ("format" in p) {
                  const fmt = p.format as ArtFormat;
                  if (!prev.sku_code || prev.sku_code === skuCodeFor(slug, prev.format)) {
                    next.sku_code = skuCodeFor(slug, fmt);
                  }
                  if (fmt === "original") next.edition_size = 1;
                }
                return next;
              })
            }
          />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button type="button" className="admin-btn admin-btn--primary" onClick={addSku} style={{ fontSize: "0.75rem", padding: "4px 12px" }}>Create</button>
            <button type="button" className="admin-btn" onClick={() => { setAdding(false); setDraft(emptyDraft(slug)); }} style={{ fontSize: "0.75rem", padding: "4px 12px" }}>Cancel</button>
          </div>
        </div>
      )}

      {skus.length === 0 && !adding && (
        <p style={{ fontFamily: "var(--font-ui)", fontSize: "0.75rem", color: "var(--text-tertiary)", margin: 0 }}>
          No editions yet. Add the original (1 of 1) and any limited prints to make this piece purchasable.
        </p>
      )}

      {skus.map((sku) => {
        const isOpen = !!openSkus[sku.id];
        const varOpen = !!expanded[sku.id];
        return (
          <div key={sku.id} style={{ border: "1px solid var(--border-subtle, rgba(255,255,255,0.08))", borderRadius: 4, marginBottom: "var(--space-sm)", overflow: "hidden" }}>
            <button
              type="button"
              onClick={() => setOpenSkus((p) => ({ ...p, [sku.id]: !isOpen }))}
              aria-expanded={isOpen}
              style={{
                display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "var(--space-sm)",
                background: isOpen ? "rgba(255,255,255,0.03)" : "transparent", border: 0,
                borderBottom: isOpen ? "1px solid var(--border-subtle, rgba(255,255,255,0.08))" : "0",
                color: "inherit", cursor: "pointer", fontFamily: "var(--font-ui)", fontSize: "0.8rem", textAlign: "left",
              }}
            >
              <span style={{ width: 12, color: "var(--text-tertiary)", fontFamily: "var(--td-font-mono, monospace)" }}>{isOpen ? "v" : ">"}</span>
              <span style={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                {FORMAT_OPTIONS.find((o) => o.value === sku.format)?.label || sku.format}
              </span>
              <span style={{ color: "var(--text-tertiary)" }}>{sku.price !== null ? `$${Number(sku.price).toFixed(2)}` : "no price"}</span>
              <span style={{ color: "var(--text-tertiary)" }}>{sku.sale_mode === "inquire" ? "Inquire" : "Buy now"}</span>
              <span style={{ color: "var(--text-tertiary)" }}>{STATUS_OPTIONS.find((o) => o.value === sku.status)?.label || sku.status}</span>
              {sku.format === "limited_print" && sku.edition_size > 0 && (
                <span style={{ color: "var(--text-tertiary)" }}>{sku.editions_sold} / {sku.edition_size} sold</span>
              )}
              {sku.variants.length > 0 && (
                <span style={{ color: "var(--text-tertiary)" }}>{sku.variants.length} {sku.variants.length === 1 ? "option" : "options"}</span>
              )}
              {sku.sku_code && (
                <span style={{ marginLeft: "auto", color: "var(--text-tertiary)", fontFamily: "var(--td-font-mono, monospace)", fontSize: "0.7rem" }}>{sku.sku_code}</span>
              )}
            </button>

            {isOpen && (
              <div style={{ padding: "var(--space-sm)" }}>
                <ArtSkuFields row={sku} onChange={(p) => patchSku(sku.id, p)} onBlurSave={() => saveSku(sku.id)} />

                <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <button type="button" className="admin-btn" onClick={() => saveSku(sku.id)} style={{ fontSize: "0.6875rem", padding: "4px 10px" }}>Save</button>
                  <button type="button" className="admin-btn admin-btn--danger" onClick={() => deleteSku(sku.id)} style={{ fontSize: "0.6875rem", padding: "4px 10px" }}>Delete</button>
                  <button type="button" className="admin-btn" onClick={() => setExpanded((p) => ({ ...p, [sku.id]: !varOpen }))} style={{ fontSize: "0.6875rem", padding: "4px 10px", marginLeft: "auto" }}>
                    Framing / options ({sku.variants.length}) {varOpen ? "v" : ">"}
                  </button>
                </div>

                {varOpen && (
                  <div style={{ marginTop: "var(--space-sm)", paddingTop: "var(--space-sm)", borderTop: "1px dashed var(--border-subtle, rgba(255,255,255,0.08))" }}>
                    {sku.variants.length === 0 && (
                      <p style={{ fontFamily: "var(--font-ui)", fontSize: "0.7rem", color: "var(--text-tertiary)", margin: "0 0 var(--space-xs)" }}>
                        No options. Use these for framing, substrate (paper / canvas), or size.
                      </p>
                    )}
                    {sku.variants.map((v) => (
                      <VariantRowEditor
                        key={v.id}
                        row={v}
                        onChange={(p) => patchVariant(sku.id, v.id, p)}
                        onAutoSlug={() => patchVariant(sku.id, v.id, { variant_slug: slugify(v.label || "") })}
                        onSave={() => saveVariant(sku.id, v.id)}
                        onDelete={() => deleteVariant(sku.id, v.id)}
                      />
                    ))}
                    <button type="button" className="admin-btn" onClick={() => addVariant(sku.id)} style={{ fontSize: "0.6875rem", padding: "4px 10px", marginTop: 4 }}>+ Add Option</button>
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

function serializeSku(row: SkuRow): Record<string, unknown> {
  return {
    format: row.format,
    fulfillment_method: row.fulfillment_method,
    sale_mode: row.sale_mode,
    sku_code: row.sku_code,
    price: row.price,
    status: row.status,
    stock: row.stock,
    edition_size: row.edition_size,
    editions_sold: row.editions_sold,
    coa_enabled: row.coa_enabled,
    weight_grams: row.weight_grams,
    ships_in_days: row.ships_in_days,
    shipping_first_cents: row.shipping_first_cents,
    shipping_addl_cents: row.shipping_addl_cents,
    shipping_ca_first_cents: row.shipping_ca_first_cents,
    shipping_ca_addl_cents: row.shipping_ca_addl_cents,
    shipping_uk_first_cents: row.shipping_uk_first_cents,
    shipping_uk_addl_cents: row.shipping_uk_addl_cents,
    shipping_row_first_cents: row.shipping_row_first_cents,
    shipping_row_addl_cents: row.shipping_row_addl_cents,
    free_shipping_exempt: row.free_shipping_exempt,
    printify_product_id: row.printify_product_id,
    printify_variant_id: row.printify_variant_id,
    display_order: row.display_order,
  };
}

function ArtSkuFields({
  row,
  onChange,
  onBlurSave,
}: {
  row: DraftSku | SkuRow;
  onChange: (patch: Partial<SkuRow>) => void;
  onBlurSave?: () => void;
}) {
  const isOriginal = row.format === "original";
  const isPrintify = row.fulfillment_method === "printify";

  return (
    <>
      <div className="obsv-editor__field-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div className={fieldCls}>
          <label className={labelCls}>Format</label>
          <select className={inputCls} value={row.format} onChange={(e) => onChange({ format: e.target.value as ArtFormat })} onBlur={onBlurSave}>
            {FORMAT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className={fieldCls}>
          <label className={labelCls}>Status</label>
          <select className={inputCls} value={row.status} onChange={(e) => onChange({ status: e.target.value as ArtStatus })} onBlur={onBlurSave}>
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className={fieldCls}>
          <label className={labelCls}>How it sells</label>
          <select className={inputCls} value={row.sale_mode} onChange={(e) => onChange({ sale_mode: e.target.value as SaleMode })} onBlur={onBlurSave}>
            <option value="buy_now">Buy now (Stripe checkout)</option>
            <option value="inquire">Inquire / reserve (concierge)</option>
          </select>
        </div>
        <div className={fieldCls}>
          <label className={labelCls}>Fulfillment</label>
          <select className={inputCls} value={row.fulfillment_method} onChange={(e) => onChange({ fulfillment_method: e.target.value as "manual" | "printify" })} onBlur={onBlurSave}>
            <option value="manual">Manual (Chad ships)</option>
            <option value="printify">Printify</option>
          </select>
        </div>
        <div className={fieldCls} style={{ gridColumn: "1 / -1" }}>
          <label className={labelCls}>SKU code</label>
          <input type="text" className={monoCls} value={row.sku_code || ""} onChange={(e) => onChange({ sku_code: e.target.value || null })} onBlur={onBlurSave} placeholder="auto-default on save" />
        </div>
        <div className={fieldCls}>
          <label className={labelCls}>Price ($)</label>
          <input type="number" step="0.01" min={0} className={inputCls} value={row.price ?? ""} onChange={(e) => onChange({ price: e.target.value ? parseFloat(e.target.value) : null })} onBlur={onBlurSave} placeholder="0.00" />
        </div>
        <div className={fieldCls}>
          <label className={labelCls}>Display order</label>
          <input type="number" className={inputCls} value={row.display_order} onChange={(e) => onChange({ display_order: parseInt(e.target.value) || 0 })} onBlur={onBlurSave} />
        </div>
      </div>

      {isOriginal ? (
        <p style={{ fontFamily: "var(--font-ui)", fontSize: "0.7rem", color: "var(--text-tertiary)", margin: "8px 0 0" }}>
          Original is 1 of 1 -- edition size is locked. Set status to Sold or Reserved as it moves.
        </p>
      ) : (
        <div className="obsv-editor__field-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
          <div className={fieldCls}>
            <label className={labelCls}>Edition size (0 = open)</label>
            <input type="number" min={0} className={inputCls} value={row.edition_size} onChange={(e) => onChange({ edition_size: parseInt(e.target.value) || 0 })} onBlur={onBlurSave} />
          </div>
          <div className={fieldCls}>
            <label className={labelCls}>Editions sold</label>
            <input type="number" min={0} className={inputCls} value={row.editions_sold} onChange={(e) => onChange({ editions_sold: parseInt(e.target.value) || 0 })} onBlur={onBlurSave} title="Normally incremented by the Stripe webhook; edit to correct refunds." />
          </div>
        </div>
      )}

      <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
        <input type="checkbox" checked={!!row.coa_enabled} onChange={(e) => onChange({ coa_enabled: e.target.checked })} onBlur={onBlurSave} />
        <span className={labelCls} style={{ margin: 0 }}>Ships with a signed Certificate of Authenticity</span>
      </label>

      <div className="obsv-editor__field-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
        <div className={fieldCls}>
          <label className={labelCls}>Weight (grams)</label>
          <input type="number" min={0} className={inputCls} value={row.weight_grams ?? ""} onChange={(e) => onChange({ weight_grams: e.target.value ? parseInt(e.target.value) : null })} onBlur={onBlurSave} />
        </div>
        <div className={fieldCls}>
          <label className={labelCls}>Ships in (days)</label>
          <input type="number" min={0} className={inputCls} value={row.ships_in_days ?? ""} onChange={(e) => onChange({ ships_in_days: e.target.value ? parseInt(e.target.value) : null })} onBlur={onBlurSave} />
        </div>
      </div>

      {!isPrintify && (
        <div style={{ marginTop: 8 }}>
          <div className={labelCls} style={{ marginBottom: 4 }}>Shipping rates by zone (first item / each additional)</div>
          <div className="obsv-editor__field-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <ShipField label="US: first item ($)" cents={row.shipping_first_cents} onChange={(c) => onChange({ shipping_first_cents: c })} onBlurSave={onBlurSave} />
            <ShipField label="US: each additional ($)" cents={row.shipping_addl_cents} onChange={(c) => onChange({ shipping_addl_cents: c })} onBlurSave={onBlurSave} />
            <ShipField label="Canada: first item ($)" cents={row.shipping_ca_first_cents} onChange={(c) => onChange({ shipping_ca_first_cents: c })} onBlurSave={onBlurSave} />
            <ShipField label="Canada: each additional ($)" cents={row.shipping_ca_addl_cents} onChange={(c) => onChange({ shipping_ca_addl_cents: c })} onBlurSave={onBlurSave} />
            <ShipField label="UK: first item ($)" cents={row.shipping_uk_first_cents} onChange={(c) => onChange({ shipping_uk_first_cents: c })} onBlurSave={onBlurSave} />
            <ShipField label="UK: each additional ($)" cents={row.shipping_uk_addl_cents} onChange={(c) => onChange({ shipping_uk_addl_cents: c })} onBlurSave={onBlurSave} />
            <ShipField label="Rest of world: first item ($)" cents={row.shipping_row_first_cents} onChange={(c) => onChange({ shipping_row_first_cents: c })} onBlurSave={onBlurSave} />
            <ShipField label="Rest of world: each additional ($)" cents={row.shipping_row_addl_cents} onChange={(c) => onChange({ shipping_row_addl_cents: c })} onBlurSave={onBlurSave} />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
            <input type="checkbox" checked={!!row.free_shipping_exempt} onChange={(e) => onChange({ free_shipping_exempt: e.target.checked })} onBlur={onBlurSave} />
            <span className={labelCls} style={{ margin: 0 }}>Always charge shipping (exclude from the free-US-shipping threshold)</span>
          </label>
        </div>
      )}

      {isPrintify && (
        <div className="obsv-editor__field-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
          <div className={fieldCls}>
            <label className={labelCls}>Printify product ID</label>
            <input type="text" className={monoCls} value={row.printify_product_id || ""} onChange={(e) => onChange({ printify_product_id: e.target.value || null })} onBlur={onBlurSave} />
          </div>
          <div className={fieldCls}>
            <label className={labelCls}>Printify variant ID</label>
            <input type="text" className={monoCls} value={row.printify_variant_id || ""} onChange={(e) => onChange({ printify_variant_id: e.target.value || null })} onBlur={onBlurSave} />
          </div>
        </div>
      )}
    </>
  );
}

function ShipField({
  label,
  cents,
  onChange,
  onBlurSave,
}: {
  label: string;
  cents: number | null;
  onChange: (cents: number | null) => void;
  onBlurSave?: () => void;
}) {
  return (
    <div className={fieldCls}>
      <label className={labelCls}>{label}</label>
      <input
        type="number"
        min={0}
        step="0.01"
        className={inputCls}
        value={cents != null ? (cents / 100).toString() : ""}
        onChange={(e) => onChange(e.target.value ? Math.round(parseFloat(e.target.value) * 100) : null)}
        onBlur={onBlurSave}
      />
    </div>
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
    <div style={{ display: "grid", gridTemplateColumns: "2fr 2fr 1fr 1fr 1fr 1fr auto", gap: 6, alignItems: "end", marginBottom: 6 }}>
      <div className={fieldCls}>
        <label className={labelCls} style={{ fontSize: "0.625rem" }}>Label</label>
        <input type="text" className={inputCls} value={row.label} onChange={(e) => onChange({ label: e.target.value })} onBlur={() => { if (!row.variant_slug) onAutoSlug(); onSave(); }} />
      </div>
      <div className={fieldCls}>
        <label className={labelCls} style={{ fontSize: "0.625rem" }}>Slug</label>
        <input type="text" className={monoCls} value={row.variant_slug} onChange={(e) => onChange({ variant_slug: e.target.value })} onBlur={onSave} />
      </div>
      <div className={fieldCls}>
        <label className={labelCls} style={{ fontSize: "0.625rem" }}>Price delta</label>
        <input type="number" step="0.01" className={inputCls} value={row.price_delta} onChange={(e) => onChange({ price_delta: parseFloat(e.target.value) || 0 })} onBlur={onSave} />
      </div>
      <div className={fieldCls}>
        <label className={labelCls} style={{ fontSize: "0.625rem" }}>Stock</label>
        <input type="number" className={inputCls} value={row.stock ?? ""} onChange={(e) => onChange({ stock: e.target.value ? parseInt(e.target.value) : null })} onBlur={onSave} />
      </div>
      <div className={fieldCls}>
        <label className={labelCls} style={{ fontSize: "0.625rem" }}>Status</label>
        <select className={inputCls} value={row.status} onChange={(e) => onChange({ status: e.target.value as ArtStatus })} onBlur={onSave}>
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <div className={fieldCls}>
        <label className={labelCls} style={{ fontSize: "0.625rem" }}>Order</label>
        <input type="number" className={inputCls} value={row.display_order} onChange={(e) => onChange({ display_order: parseInt(e.target.value) || 0 })} onBlur={onSave} />
      </div>
      <button type="button" className="admin-btn admin-btn--danger" onClick={onDelete} style={{ fontSize: "0.625rem", padding: "4px 8px" }} aria-label="Delete option">x</button>
    </div>
  );
}
