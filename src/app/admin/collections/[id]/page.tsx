"use client";

import Link from "next/link";
import { useState, useEffect, useCallback, use } from "react";

interface Product {
  id: string;
  slug: string | null;
  title: string;
  image_url: string | null;
  image_alt: string | null;
  status: string;
  fulfillment: string;
  price: number | null;
  position?: number;
}

interface Collection {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  status: "active" | "archived";
  sort_order: number;
}

export default function CollectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [collection, setCollection] = useState<Collection | null>(null);
  const [inCollection, setInCollection] = useState<Product[]>([]);
  const [available, setAvailable] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingMeta, setSavingMeta] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [filter, setFilter] = useState("");

  const [editTitle, setEditTitle] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editStatus, setEditStatus] = useState<"active" | "archived">("active");

  const fetchAll = useCallback(async () => {
    const [colRes, prodRes] = await Promise.all([
      fetch(`/api/admin/collections/${id}`),
      fetch(`/api/admin/collections/${id}/products`),
    ]);
    if (colRes.ok) {
      const c = await colRes.json();
      setCollection(c);
      setEditTitle(c.title);
      setEditSlug(c.slug);
      setEditDescription(c.description || "");
      setEditStatus(c.status);
    }
    if (prodRes.ok) {
      const p = await prodRes.json();
      setInCollection(p.in_collection || []);
      setAvailable(p.available || []);
    }
    setLoading(false);
  }, [id]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- client-side data load when id changes
  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function saveMeta() {
    if (!collection) return;
    setSavingMeta(true);
    setError("");
    const res = await fetch(`/api/admin/collections/${collection.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: editTitle.trim(),
        slug: editSlug.trim(),
        description: editDescription.trim() || null,
        status: editStatus,
      }),
    });
    if (!res.ok) {
      const { error: msg } = await res.json();
      setError(msg || "Failed to save");
    } else {
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
      await fetchAll();
    }
    setSavingMeta(false);
  }

  async function addProduct(productId: string) {
    setError("");
    const res = await fetch(`/api/admin/collections/${id}/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_id: productId }),
    });
    if (!res.ok) {
      const { error: msg } = await res.json();
      setError(msg || "Failed to add product");
    } else {
      await fetchAll();
    }
  }

  async function removeProduct(productId: string) {
    setError("");
    const res = await fetch(
      `/api/admin/collections/${id}/products?product_id=${encodeURIComponent(productId)}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      const { error: msg } = await res.json();
      setError(msg || "Failed to remove product");
    } else {
      await fetchAll();
    }
  }

  async function moveProduct(productId: string, dir: -1 | 1) {
    const idx = inCollection.findIndex((p) => p.id === productId);
    const newIdx = idx + dir;
    if (idx === -1 || newIdx < 0 || newIdx >= inCollection.length) return;
    const reordered = [...inCollection];
    const [moved] = reordered.splice(idx, 1);
    reordered.splice(newIdx, 0, moved);
    setInCollection(reordered);

    const res = await fetch(`/api/admin/collections/${id}/products`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_ids: reordered.map((p) => p.id) }),
    });
    if (!res.ok) {
      const { error: msg } = await res.json();
      setError(msg || "Failed to reorder");
      await fetchAll();
    }
  }

  if (loading) {
    return (
      <div className="admin-page">
        <p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>Loading…</p>
      </div>
    );
  }

  if (!collection) {
    return (
      <div className="admin-page">
        <p>Collection not found.</p>
        <Link href="/admin/collections" className="admin-btn">← Back to Collections</Link>
      </div>
    );
  }

  const filteredAvailable = available.filter((p) =>
    !filter || p.title.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <Link href="/admin/collections" className="admin-table__link" style={{ marginBottom: 4, display: "inline-block" }}>
          ← Collections
        </Link>
        <h1 className="admin-page__title">{collection.title}</h1>
      </div>

      {error && <p className="obsv-editor__error">{error}</p>}

      <section style={{ marginBottom: "var(--space-lg)" }}>
        <h2 style={{ fontSize: "1rem", marginBottom: "var(--space-sm)", color: "var(--text-secondary)" }}>
          Metadata
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-sm)", maxWidth: 800 }}>
          <label>
            <span style={{ display: "block", fontSize: "0.8rem", color: "var(--text-tertiary)" }}>Title</span>
            <input
              className="admin-meta-form__input"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              style={{ width: "100%" }}
            />
          </label>
          <label>
            <span style={{ display: "block", fontSize: "0.8rem", color: "var(--text-tertiary)" }}>Slug</span>
            <input
              className="admin-meta-form__input admin-meta-form__input--mono"
              value={editSlug}
              onChange={(e) => setEditSlug(e.target.value)}
              style={{ width: "100%" }}
            />
          </label>
          <label style={{ gridColumn: "1 / -1" }}>
            <span style={{ display: "block", fontSize: "0.8rem", color: "var(--text-tertiary)" }}>Description</span>
            <textarea
              className="admin-meta-form__input"
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              rows={2}
              style={{ width: "100%", resize: "vertical" }}
            />
          </label>
          <label>
            <span style={{ display: "block", fontSize: "0.8rem", color: "var(--text-tertiary)" }}>Status</span>
            <select
              className="admin-meta-form__input"
              value={editStatus}
              onChange={(e) => setEditStatus(e.target.value as "active" | "archived")}
              style={{ width: "100%" }}
            >
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          <div style={{ alignSelf: "end" }}>
            <button className="admin-btn admin-btn--primary" onClick={saveMeta} disabled={savingMeta}>
              {savingMeta ? "Saving…" : "Save"}
            </button>
            {savedFlash && <span style={{ marginLeft: 8, color: "var(--text-tertiary)", fontSize: "0.8rem" }}>Saved.</span>}
          </div>
        </div>
      </section>

      <section style={{ marginBottom: "var(--space-lg)" }}>
        <h2 style={{ fontSize: "1rem", marginBottom: "var(--space-sm)", color: "var(--text-secondary)" }}>
          Products in this collection ({inCollection.length})
        </h2>
        {inCollection.length === 0 ? (
          <p style={{ color: "var(--text-tertiary)", fontStyle: "italic" }}>No products assigned yet. Add some from the list below.</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th className="admin-table__th" style={{ width: 60 }}>Image</th>
                <th className="admin-table__th">Title</th>
                <th className="admin-table__th" style={{ width: 90 }}>Position</th>
                <th className="admin-table__th" style={{ width: 220 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {inCollection.map((p, i) => (
                <tr key={p.id} className="admin-table__row">
                  <td className="admin-table__td">
                    {p.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.image_url} alt="" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 4 }} />
                    ) : (
                      <div style={{ width: 40, height: 40, background: "var(--bg-secondary)", borderRadius: 4 }} />
                    )}
                  </td>
                  <td className="admin-table__td">{p.title}</td>
                  <td className="admin-table__td" style={{ color: "var(--text-tertiary)" }}>{i}</td>
                  <td className="admin-table__td" style={{ whiteSpace: "nowrap" }}>
                    <button className="admin-btn" onClick={() => moveProduct(p.id, -1)} disabled={i === 0} style={{ marginRight: 4 }}>↑</button>
                    <button className="admin-btn" onClick={() => moveProduct(p.id, 1)} disabled={i === inCollection.length - 1} style={{ marginRight: 4 }}>↓</button>
                    <button className="admin-btn admin-btn--danger" onClick={() => removeProduct(p.id)}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2 style={{ fontSize: "1rem", marginBottom: "var(--space-sm)", color: "var(--text-secondary)" }}>
          Add products ({available.length} available)
        </h2>
        <input
          className="admin-meta-form__input"
          type="search"
          placeholder="Filter by title…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ width: 320, marginBottom: "var(--space-sm)" }}
        />
        {filteredAvailable.length === 0 ? (
          <p style={{ color: "var(--text-tertiary)", fontStyle: "italic" }}>No more products to add.</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th className="admin-table__th" style={{ width: 60 }}>Image</th>
                <th className="admin-table__th">Title</th>
                <th className="admin-table__th" style={{ width: 110 }}>Fulfillment</th>
                <th className="admin-table__th" style={{ width: 100 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredAvailable.map((p) => (
                <tr key={p.id} className="admin-table__row">
                  <td className="admin-table__td">
                    {p.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.image_url} alt="" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 4 }} />
                    ) : (
                      <div style={{ width: 40, height: 40, background: "var(--bg-secondary)", borderRadius: 4 }} />
                    )}
                  </td>
                  <td className="admin-table__td">{p.title}</td>
                  <td className="admin-table__td" style={{ color: "var(--text-tertiary)", fontSize: "0.8rem" }}>{p.fulfillment}</td>
                  <td className="admin-table__td">
                    <button className="admin-btn admin-btn--primary" onClick={() => addProduct(p.id)}>Add</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
