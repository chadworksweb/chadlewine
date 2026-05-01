"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAutosave } from "@/hooks/useAutosave";
import { MerchGalleryPanel } from "@/components/admin/MerchGalleryPanel";
import { LinkedPrintPicker } from "@/components/admin/LinkedPrintPicker";

const TIERS = ["art", "line", "fusion", "pick"] as const;
const STATUSES = ["active", "inactive", "pending_review"] as const;
const FULFILLMENTS = ["manual", "printify_curated", "printify_configurator"] as const;

interface ProductData {
  id?: string;
  title: string;
  slug: string;
  tier: string;
  fulfillment: string;
  status: string;
  description: string;
  price: number | null;
  printify_product_id: string | null;
  image_url: string | null;
  image_alt: string | null;
  source_observation_id: string | null;
  is_catalog_item: boolean;
  linked_art_piece_id: string | null;
}

const emptyProduct: ProductData = {
  title: "",
  slug: "",
  tier: "art",
  fulfillment: "manual",
  status: "active",
  description: "",
  price: null,
  printify_product_id: null,
  image_url: null,
  image_alt: null,
  source_observation_id: null,
  is_catalog_item: false,
  linked_art_piece_id: null,
};

interface Props {
  /** Product id or slug. Omit for the new-product flow. */
  idOrSlug?: string;
}

export function MerchProductEditor({ idOrSlug }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<ProductData | null>(idOrSlug ? null : { ...emptyProduct });
  const [error, setError] = useState("");

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
          tier: d.tier || "art",
          fulfillment: d.fulfillment || "printify_curated",
          status: d.status || "active",
          description: d.description || "",
          price: d.price ?? null,
          printify_product_id: d.printify_product_id ?? null,
          image_url: d.image_url ?? null,
          image_alt: d.image_alt ?? null,
          source_observation_id: d.source_observation_id ?? null,
          is_catalog_item: !!d.is_catalog_item,
          linked_art_piece_id: d.linked_art_piece_id ?? null,
        });
      })
      .catch(() => setError("Not found"));
  }, [idOrSlug]);

  const buildPayload = useCallback((data: ProductData | null) => {
    if (!data) return {};
    return {
      title: data.title,
      slug: data.slug || null,
      tier: data.tier,
      fulfillment: data.fulfillment,
      status: data.status,
      description: data.description || null,
      price: data.price,
      printify_product_id: data.printify_product_id,
      image_url: data.image_url,
      image_alt: data.image_alt,
      source_observation_id: data.source_observation_id,
      is_catalog_item: data.is_catalog_item,
      linked_art_piece_id: data.linked_art_piece_id,
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
        <label className="obsv-editor__label">Tier</label>
        <select className="obsv-editor__input" value={form.tier} onChange={(e) => set("tier", e.target.value)}>
          {TIERS.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
        </select>
      </div>

      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Fulfillment</label>
        <select className="obsv-editor__input" value={form.fulfillment} onChange={(e) => set("fulfillment", e.target.value)}>
          {FULFILLMENTS.map((f) => (
            <option key={f} value={f}>
              {f === "manual" ? "Manual (self-fulfilled)" : f === "printify_curated" ? "Printify Curated" : "Printify Configurator"}
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
        <label className="obsv-editor__label">Description</label>
        <textarea
          className="obsv-editor__input"
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          rows={3}
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

      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Source Observation ID (optional)</label>
        <input
          className="obsv-editor__input obsv-editor__input--mono"
          value={form.source_observation_id ?? ""}
          onChange={(e) => set("source_observation_id", e.target.value || null)}
        />
      </div>

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
        />
      )}

      <LinkedPrintPicker
        value={form.linked_art_piece_id}
        onChange={(id) => set("linked_art_piece_id", id)}
      />

      <div className="obsv-editor__field">
        <label className="obsv-editor__label">
          <input
            type="checkbox"
            checked={form.is_catalog_item}
            onChange={(e) => set("is_catalog_item", e.target.checked)}
            style={{ marginRight: 8 }}
          />
          Catalog Item
        </label>
      </div>
    </div>
  );
}
