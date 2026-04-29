"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const TIERS = ["art", "line", "fusion", "pick"] as const;
const FULFILLMENTS = ["manual", "printify_curated", "printify_configurator"] as const;

export default function NewProductPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    title: "",
    tier: "art" as string,
    fulfillment: "manual" as string,
    description: "",
    price: "",
    source_observation_id: "",
    printify_product_id: "",
    image_url: "",
    image_alt: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    if (!form.title.trim()) { setError("Title required"); return; }
    setSaving(true);
    const res = await fetch("/api/admin/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        price: form.price ? parseFloat(form.price) : null,
        source_observation_id: form.source_observation_id || null,
        printify_product_id: form.printify_product_id || null,
        image_url: form.image_url || null,
        image_alt: form.image_alt || null,
      }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Save failed");
      setSaving(false);
      return;
    }
    const saved = await res.json();
    router.push(`/admin/merch/products/${saved.slug || saved.id}`);
  }

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">New Product</h1>
        <button className="admin-btn admin-btn--primary" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </button>
      </div>

      {error && <p className="obsv-editor__error">{error}</p>}

      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Title</label>
        <input className="obsv-editor__input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      </div>

      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Tier</label>
        <select className="obsv-editor__input" value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value })}>
          {TIERS.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
        </select>
      </div>

      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Fulfillment</label>
        <select className="obsv-editor__input" value={form.fulfillment} onChange={(e) => setForm({ ...form, fulfillment: e.target.value })}>
          {FULFILLMENTS.map((f) => <option key={f} value={f}>{f === "manual" ? "Manual (self-fulfilled)" : f === "printify_curated" ? "Printify Curated" : "Printify Configurator"}</option>)}
        </select>
      </div>

      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Description</label>
        <textarea className="obsv-editor__input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
      </div>

      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Price ($)</label>
        <input className="obsv-editor__input" type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="24.99" />
      </div>

      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Source Observation ID (optional)</label>
        <input className="obsv-editor__input" value={form.source_observation_id} onChange={(e) => setForm({ ...form, source_observation_id: e.target.value })} />
      </div>

      {form.fulfillment !== "manual" && (
        <div className="obsv-editor__field">
          <label className="obsv-editor__label">Printify Product ID</label>
          <input className="obsv-editor__input" value={form.printify_product_id} onChange={(e) => setForm({ ...form, printify_product_id: e.target.value })} />
        </div>
      )}

      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Product Image URL</label>
        <input className="obsv-editor__input" value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} placeholder="https://images.printify.com/mockup/..." />
      </div>
      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Image Alt Text</label>
        <input className="obsv-editor__input" value={form.image_alt} onChange={(e) => setForm({ ...form, image_alt: e.target.value })} />
      </div>
    </div>
  );
}
