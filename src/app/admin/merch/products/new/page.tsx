"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const TIERS = ["art", "line", "fusion", "pick", "diddy"] as const;

export default function NewProductPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    title: "",
    tier: "art" as string,
    description: "",
    price_cents: "",
    source_observation_id: "",
    printify_product_id: "",
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
        price_cents: form.price_cents ? parseInt(form.price_cents) : null,
        source_observation_id: form.source_observation_id || null,
        printify_product_id: form.printify_product_id || null,
      }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Save failed");
      setSaving(false);
      return;
    }
    const saved = await res.json();
    router.push(`/admin/merch/products/${saved.id}`);
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
        <label className="obsv-editor__label">Description</label>
        <textarea className="obsv-editor__input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
      </div>

      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Price (cents)</label>
        <input className="obsv-editor__input" type="number" value={form.price_cents} onChange={(e) => setForm({ ...form, price_cents: e.target.value })} placeholder="2499" />
      </div>

      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Source Observation ID (optional)</label>
        <input className="obsv-editor__input" value={form.source_observation_id} onChange={(e) => setForm({ ...form, source_observation_id: e.target.value })} />
      </div>

      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Printify Product ID (optional)</label>
        <input className="obsv-editor__input" value={form.printify_product_id} onChange={(e) => setForm({ ...form, printify_product_id: e.target.value })} />
      </div>
    </div>
  );
}
