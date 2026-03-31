"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

const TIERS = ["art", "line", "fusion", "pick", "diddy"] as const;
const STATUSES = ["active", "inactive", "pending_review"] as const;

export default function EditProductPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [form, setForm] = useState<Record<string, unknown> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/admin/products/${id}`)
      .then((r) => r.json())
      .then((d) => setForm(d))
      .catch(() => setError("Not found"));
  }, [id]);

  async function handleSave() {
    if (!form) return;
    setSaving(true);
    const res = await fetch(`/api/admin/products/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Save failed");
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!confirm("Delete this product?")) return;
    await fetch(`/api/admin/products/${id}`, { method: "DELETE" });
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

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">Edit Product</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="admin-btn admin-btn--danger" onClick={handleDelete}>Delete</button>
          <button className="admin-btn admin-btn--primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {error && <p className="obsv-editor__error">{error}</p>}

      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Title</label>
        <input className="obsv-editor__input" value={(form.title as string) || ""} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      </div>

      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Tier</label>
        <select className="obsv-editor__input" value={(form.tier as string) || "art"} onChange={(e) => setForm({ ...form, tier: e.target.value })}>
          {TIERS.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
        </select>
      </div>

      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Status</label>
        <select className="obsv-editor__input" value={(form.status as string) || "active"} onChange={(e) => setForm({ ...form, status: e.target.value })}>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Description</label>
        <textarea className="obsv-editor__input" value={(form.description as string) || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
      </div>

      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Price ($)</label>
        <input className="obsv-editor__input" type="number" step="0.01" value={(form.price as number) || ""} onChange={(e) => setForm({ ...form, price: e.target.value ? parseFloat(e.target.value) : null })} />
      </div>

      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Printify Product ID</label>
        <input className="obsv-editor__input" value={(form.printify_product_id as string) || ""} onChange={(e) => setForm({ ...form, printify_product_id: e.target.value || null })} />
      </div>

      <div className="obsv-editor__field">
        <label className="obsv-editor__label">
          <input type="checkbox" checked={!!form.is_catalog_item} onChange={(e) => setForm({ ...form, is_catalog_item: e.target.checked })} style={{ marginRight: 8 }} />
          Catalog Item
        </label>
      </div>
    </div>
  );
}
