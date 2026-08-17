"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAutosave } from "@/hooks/useAutosave";
import { MerchGalleryPanel } from "@/components/admin/MerchGalleryPanel";
import { LinkedPrintPicker } from "@/components/admin/LinkedPrintPicker";
import { EntityPicker } from "@/components/EntityPicker";
import { SeoFieldsPanel } from "@/components/SeoFieldsPanel";
import { FocalPointPicker, type CropRatio, type CropPatch } from "@/components/FocalPointPicker";

const STATUSES = ["active", "inactive", "pending_review"] as const;
const FULFILLMENTS = ["manual", "printify_curated"] as const;

interface MerchType {
  id: string;
  slug: string;
  label: string;
  sort_order: number;
}

interface ReleaseSkuOption {
  id: string;
  format: string;
  status: string;
  release: { id: string; slug: string; title: string; status: string; release_date: string | null } | null;
}

const FORMAT_LABEL: Record<string, string> = {
  vinyl: "Vinyl",
  cd: "CD",
  cassette: "Cassette",
};

interface ProductData {
  id?: string;
  title: string;
  slug: string;
  fulfillment: string;
  status: string;
  description: string;
  seo_title: string;
  seo_description: string;
  price: number | null;
  printify_product_id: string | null;
  image_url: string | null;
  image_alt: string | null;
  hero_focal_x: number | null;
  hero_focal_y: number | null;
  hero_zoom: number | null;
  linked_art_piece_id: string | null;
  merch_type_id: string | null;
  release_sku_id: string | null;
  shipping_first_cents: number | null;
  shipping_addl_cents: number | null;
  shipping_ca_first_cents: number | null;
  shipping_ca_addl_cents: number | null;
  shipping_uk_first_cents: number | null;
  shipping_uk_addl_cents: number | null;
  shipping_row_first_cents: number | null;
  shipping_row_addl_cents: number | null;
  free_shipping_exempt: boolean;
  is_new: boolean;
}

const emptyProduct: ProductData = {
  title: "",
  slug: "",
  fulfillment: "manual",
  status: "active",
  description: "",
  seo_title: "",
  seo_description: "",
  price: null,
  printify_product_id: null,
  image_url: null,
  image_alt: null,
  hero_focal_x: null,
  hero_focal_y: null,
  hero_zoom: 1,
  linked_art_piece_id: null,
  merch_type_id: null,
  release_sku_id: null,
  shipping_first_cents: null,
  shipping_addl_cents: null,
  shipping_ca_first_cents: null,
  shipping_ca_addl_cents: null,
  shipping_uk_first_cents: null,
  shipping_uk_addl_cents: null,
  shipping_row_first_cents: null,
  shipping_row_addl_cents: null,
  free_shipping_exempt: false,
  is_new: false,
};

interface Props {
  /** Product id or slug. Omit for the new-product flow. */
  idOrSlug?: string;
}

export function MerchProductEditor({ idOrSlug }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<ProductData | null>(idOrSlug ? null : { ...emptyProduct });
  const [error, setError] = useState("");
  const [merchTypes, setMerchTypes] = useState<MerchType[]>([]);
  const [releaseSkus, setReleaseSkus] = useState<ReleaseSkuOption[]>([]);

  useEffect(() => {
    fetch("/api/admin/merch-types")
      .then((r) => r.json())
      .then((d) => setMerchTypes(Array.isArray(d) ? d : []))
      .catch(() => setMerchTypes([]));
    fetch("/api/admin/release-skus")
      .then((r) => r.json())
      .then((d) => setReleaseSkus(Array.isArray(d) ? d : []))
      .catch(() => setReleaseSkus([]));
  }, []);

  useEffect(() => {
    if (!idOrSlug) return;
    fetch(`/api/admin/products/${idOrSlug}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setError(d.error);
          return;
        }
        setForm({
          id: d.id,
          title: d.title || "",
          slug: d.slug || "",
          fulfillment: d.fulfillment || "printify_curated",
          status: d.status || "active",
          description: d.description || "",
          seo_title: d.seo_title || "",
          seo_description: d.seo_description || "",
          price: d.price ?? null,
          printify_product_id: d.printify_product_id ?? null,
          image_url: d.image_url ?? null,
          image_alt: d.image_alt ?? null,
          hero_focal_x: d.hero_focal_x ?? null,
          hero_focal_y: d.hero_focal_y ?? null,
          hero_zoom: d.hero_zoom ?? 1,
          linked_art_piece_id: d.linked_art_piece_id ?? null,
          merch_type_id: d.merch_type_id ?? null,
          release_sku_id: d.release_sku_id ?? null,
          shipping_first_cents: d.shipping_first_cents ?? null,
          shipping_addl_cents: d.shipping_addl_cents ?? null,
          shipping_ca_first_cents: d.shipping_ca_first_cents ?? null,
          shipping_ca_addl_cents: d.shipping_ca_addl_cents ?? null,
          shipping_uk_first_cents: d.shipping_uk_first_cents ?? null,
          shipping_uk_addl_cents: d.shipping_uk_addl_cents ?? null,
          shipping_row_first_cents: d.shipping_row_first_cents ?? null,
          shipping_row_addl_cents: d.shipping_row_addl_cents ?? null,
          free_shipping_exempt: !!d.free_shipping_exempt,
          is_new: !!d.is_new,
        });
      })
      .catch(() => setError("Not found"));
  }, [idOrSlug]);

  const buildPayload = useCallback((data: ProductData | null) => {
    if (!data) return {};
    return {
      title: data.title,
      slug: data.slug || null,
      fulfillment: data.fulfillment,
      status: data.status,
      description: data.description || null,
      seo_title: data.seo_title || null,
      seo_description: data.seo_description || null,
      price: data.price,
      printify_product_id: data.printify_product_id,
      image_url: data.image_url,
      image_alt: data.image_alt,
      hero_focal_x: data.hero_focal_x,
      hero_focal_y: data.hero_focal_y,
      hero_zoom: data.hero_zoom,
      linked_art_piece_id: data.linked_art_piece_id,
      merch_type_id: data.merch_type_id,
      release_sku_id: data.release_sku_id,
      shipping_first_cents: data.shipping_first_cents,
      shipping_addl_cents: data.shipping_addl_cents,
      shipping_ca_first_cents: data.shipping_ca_first_cents,
      shipping_ca_addl_cents: data.shipping_ca_addl_cents,
      shipping_uk_first_cents: data.shipping_uk_first_cents,
      shipping_uk_addl_cents: data.shipping_uk_addl_cents,
      shipping_row_first_cents: data.shipping_row_first_cents,
      shipping_row_addl_cents: data.shipping_row_addl_cents,
      free_shipping_exempt: data.free_shipping_exempt,
      is_new: data.is_new,
    };
  }, []);

  const { status: autosaveStatus } = useAutosave({
    data: form,
    endpoint: "/api/admin/products",
    id: form?.id,
    buildPayload,
    enabled: !!form && form.title.trim().length > 0,
    onCreated: (newId) => {
      setForm((prev) => (prev ? { ...prev, id: newId } : prev));
    },
  });

  // After first save (slug arrives), swap URL from /new -> /[slug] without remount
  useEffect(() => {
    if (autosaveStatus !== "saved" || !form?.id) return;
    const target = form.slug || form.id;
    if (idOrSlug !== target) {
      router.replace(`/admin/merch/products/${target}`, { scroll: false });
    }
  }, [autosaveStatus, form?.id, form?.slug, idOrSlug, router]);

  function set<K extends keyof ProductData>(key: K, value: ProductData[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function handleDelete() {
    if (!form?.id) return;
    if (!confirm("Delete this product?")) return;
    await fetch(`/api/admin/products/${form.id}`, { method: "DELETE" });
    router.push("/admin/merch");
  }

  if (!form) {
    return (
      <div className="admin-page">
        <p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>
          {error || "Loading..."}
        </p>
      </div>
    );
  }

  const isExisting = !!form.id;

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">{isExisting ? "Edit Product" : "New Product"}</h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {isExisting && (
            <a
              className="admin-btn admin-btn--secondary"
              href={`/merch/${form.slug || form.id}`}
              target="_blank"
              rel="noopener"
            >
              View on Site
            </a>
          )}
          {isExisting && form.printify_product_id && (
            <a
              className="admin-btn admin-btn--secondary"
              href={`https://printify.com/app/store/products/${form.printify_product_id}`}
              target="_blank"
              rel="noopener"
            >
              View on Printify
            </a>
          )}
          {isExisting && (
            <button className="admin-btn admin-btn--danger" onClick={handleDelete}>Delete</button>
          )}
          <span className={`autosave-status autosave-status--${autosaveStatus}`}>
            {autosaveStatus === "saving" && "Saving..."}
            {autosaveStatus === "saved" && "Saved"}
            {autosaveStatus === "error" && "Save failed"}
            {autosaveStatus === "idle" && !isExisting && "Type a title to begin"}
          </span>
        </div>
      </div>

      {error && <p className="obsv-editor__error">{error}</p>}

      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Title</label>
        <input
          className="obsv-editor__input"
          value={form.title}
          onChange={(e) => set("title", e.target.value)}
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
          placeholder={isExisting ? "my-product-slug" : "auto-generated from title"}
        />
      </div>

      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Type</label>
        <select
          className="obsv-editor__input"
          value={form.merch_type_id ?? ""}
          onChange={(e) => set("merch_type_id", e.target.value || null)}
        >
          <option value="">-- uncategorized --</option>
          {merchTypes.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
      </div>

      {(() => {
        const selectedType = merchTypes.find((t) => t.id === form.merch_type_id);
        if (selectedType?.slug !== "physical_music") return null;
        const inUseByOther = new Set<string>();
        // (We don't currently fetch other merch rows here, so the dropdown
        // lists every SKU. The unique index will surface a save error if the
        // chosen SKU is already linked to another merch row.)
        return (
          <div className="obsv-editor__field">
            <label className="obsv-editor__label">Linked release SKU</label>
            <select
              className="obsv-editor__input"
              value={form.release_sku_id ?? ""}
              onChange={(e) => set("release_sku_id", e.target.value || null)}
            >
              <option value="">-- none --</option>
              {releaseSkus.map((s) => {
                const fmt = FORMAT_LABEL[s.format] ?? s.format;
                const releaseTitle = s.release?.title || "(unknown release)";
                const releaseState = s.release?.status === "published" ? "" : ` [${s.release?.status ?? "?"}]`;
                const skuState = s.status === "available" ? "" : ` (${s.status})`;
                return (
                  <option key={s.id} value={s.id} disabled={inUseByOther.has(s.id)}>
                    {releaseTitle}{releaseState} -- {fmt}{skuState}
                  </option>
                );
              })}
            </select>
            <p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)", fontSize: 12, margin: "4px 0 0" }}>
              The SKU owns format + price + stock + downloads. This merch row owns the product photography.
            </p>
          </div>
        );
      })()}

      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Fulfillment</label>
        <select className="obsv-editor__input" value={form.fulfillment} onChange={(e) => set("fulfillment", e.target.value)}>
          {FULFILLMENTS.map((f) => (
            <option key={f} value={f}>
              {f === "manual" ? "Manual (self-fulfilled)" : "Printify Curated"}
            </option>
          ))}
        </select>
      </div>

      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Status</label>
        <select className="obsv-editor__input" value={form.status} onChange={(e) => set("status", e.target.value)}>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="obsv-editor__field">
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={form.is_new}
            onChange={(e) => set("is_new", e.target.checked)}
          />
          <span>Show the NEW badge on this product&apos;s card</span>
        </label>
      </div>

      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Description</label>
        <textarea
          className="obsv-editor__input"
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          rows={3}
        />
      </div>

      <div style={{ marginTop: "1.5rem" }}>
        <SeoFieldsPanel
          seoTitle={form.seo_title}
          seoDescription={form.seo_description}
          defaultTitle={`${form.title || "Untitled"} — Chad Lewine`}
          descriptionFallbackHint="the product description"
          urlBreadcrumb="merch"
          onChange={(field, value) => set(field, value)}
        />
      </div>

      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Price ($)</label>
        <input
          className="obsv-editor__input"
          type="number"
          step="0.01"
          value={form.price ?? ""}
          onChange={(e) => set("price", e.target.value ? parseFloat(e.target.value) : null)}
        />
      </div>

      {form.fulfillment !== "manual" && (
        <div className="obsv-editor__field">
          <label className="obsv-editor__label">Printify Product ID</label>
          <input
            className="obsv-editor__input"
            value={form.printify_product_id ?? ""}
            onChange={(e) => set("printify_product_id", e.target.value || null)}
          />
        </div>
      )}

      {form.fulfillment === "manual" && (
        <div className="obsv-editor__field">
          <label className="obsv-editor__label">
            Manual shipping rates ($ &mdash; first item / each additional, by zone)
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <input className="obsv-editor__input" type="number" min={0} step="0.01"
              value={form.shipping_first_cents != null ? (form.shipping_first_cents / 100).toString() : ""}
              onChange={(e) => set("shipping_first_cents", e.target.value ? Math.round(parseFloat(e.target.value) * 100) : null)}
              placeholder="US: first (e.g. 6.00)" />
            <input className="obsv-editor__input" type="number" min={0} step="0.01"
              value={form.shipping_addl_cents != null ? (form.shipping_addl_cents / 100).toString() : ""}
              onChange={(e) => set("shipping_addl_cents", e.target.value ? Math.round(parseFloat(e.target.value) * 100) : null)}
              placeholder="US: each additional (e.g. 2.00)" />
            <input className="obsv-editor__input" type="number" min={0} step="0.01"
              value={form.shipping_ca_first_cents != null ? (form.shipping_ca_first_cents / 100).toString() : ""}
              onChange={(e) => set("shipping_ca_first_cents", e.target.value ? Math.round(parseFloat(e.target.value) * 100) : null)}
              placeholder="Canada: first" />
            <input className="obsv-editor__input" type="number" min={0} step="0.01"
              value={form.shipping_ca_addl_cents != null ? (form.shipping_ca_addl_cents / 100).toString() : ""}
              onChange={(e) => set("shipping_ca_addl_cents", e.target.value ? Math.round(parseFloat(e.target.value) * 100) : null)}
              placeholder="Canada: each additional" />
            <input className="obsv-editor__input" type="number" min={0} step="0.01"
              value={form.shipping_uk_first_cents != null ? (form.shipping_uk_first_cents / 100).toString() : ""}
              onChange={(e) => set("shipping_uk_first_cents", e.target.value ? Math.round(parseFloat(e.target.value) * 100) : null)}
              placeholder="UK: first" />
            <input className="obsv-editor__input" type="number" min={0} step="0.01"
              value={form.shipping_uk_addl_cents != null ? (form.shipping_uk_addl_cents / 100).toString() : ""}
              onChange={(e) => set("shipping_uk_addl_cents", e.target.value ? Math.round(parseFloat(e.target.value) * 100) : null)}
              placeholder="UK: each additional" />
            <input className="obsv-editor__input" type="number" min={0} step="0.01"
              value={form.shipping_row_first_cents != null ? (form.shipping_row_first_cents / 100).toString() : ""}
              onChange={(e) => set("shipping_row_first_cents", e.target.value ? Math.round(parseFloat(e.target.value) * 100) : null)}
              placeholder="Rest of world: first" />
            <input className="obsv-editor__input" type="number" min={0} step="0.01"
              value={form.shipping_row_addl_cents != null ? (form.shipping_row_addl_cents / 100).toString() : ""}
              onChange={(e) => set("shipping_row_addl_cents", e.target.value ? Math.round(parseFloat(e.target.value) * 100) : null)}
              placeholder="Rest of world: each additional" />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
            <input
              type="checkbox"
              checked={form.free_shipping_exempt}
              onChange={(e) => set("free_shipping_exempt", e.target.checked)}
            />
            <span>Always charge shipping (exclude from the free-US-shipping threshold)</span>
          </label>
        </div>
      )}

      {!isExisting && (
        <>
          <div className="obsv-editor__field">
            <label className="obsv-editor__label">Product Image URL</label>
            <input
              className="obsv-editor__input"
              value={form.image_url ?? ""}
              onChange={(e) => set("image_url", e.target.value || null)}
              placeholder="https://images.printify.com/mockup/..."
            />
          </div>
          <div className="obsv-editor__field">
            <label className="obsv-editor__label">Image Alt Text</label>
            <input
              className="obsv-editor__input"
              value={form.image_alt ?? ""}
              onChange={(e) => set("image_alt", e.target.value || null)}
            />
          </div>
        </>
      )}

      {isExisting && form.id && (
        <MerchGalleryPanel
          productId={form.id}
          fulfillment={form.fulfillment}
          slug={form.slug || null}
          printifyProductId={form.printify_product_id}
        />
      )}

      {form.image_url && (
        <div className="obsv-editor__panel">
          <h3 className="obsv-editor__panel-title">Homepage hero crop &amp; focal point</h3>
          <FocalPointPicker
            src={form.image_url}
            alt={form.image_alt || form.title}
            ratios={["hero"]}
            crops={{
              hero: { focalX: form.hero_focal_x, focalY: form.hero_focal_y, zoom: form.hero_zoom },
              card: { focalX: null, focalY: null, zoom: 1 },
              portrait: { focalX: null, focalY: null, zoom: 1 },
            }}
            onChange={(ratio: CropRatio, patch: CropPatch) => {
              if (ratio !== "hero") return;
              const updates: Partial<ProductData> = {};
              if ("focalX" in patch) updates.hero_focal_x = patch.focalX;
              if ("focalY" in patch) updates.hero_focal_y = patch.focalY;
              if ("zoom" in patch) updates.hero_zoom = patch.zoom ?? 1;
              setForm((prev) => (prev ? { ...prev, ...updates } : prev));
            }}
          />
        </div>
      )}

      <LinkedPrintPicker
        value={form.linked_art_piece_id}
        onChange={(id) => set("linked_art_piece_id", id)}
      />

      {isExisting && form.id && (
        <div className="obsv-editor__field">
          <label className="obsv-editor__label">You might also like (shown on product page)</label>
          <EntityPicker sourceType="merch" sourceId={form.id} />
        </div>
      )}

    </div>
  );
}
