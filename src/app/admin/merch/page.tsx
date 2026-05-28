"use client";

import Link from "next/link";
import { useState, useEffect, useCallback, useMemo } from "react";

type AdminSortKey = "featured" | "newest" | "oldest" | "title_asc" | "price_asc" | "price_desc";

const SORT_OPTIONS: { value: AdminSortKey; label: string }[] = [
  { value: "featured", label: "Featured" },
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "title_asc", label: "Title A-Z" },
  { value: "price_asc", label: "Price low-high" },
  { value: "price_desc", label: "Price high-low" },
];

interface Product {
  id: string;
  slug: string | null;
  tier: string;
  fulfillment: string;
  title: string;
  price: number | null;
  status: string;
  printify_product_id: string | null;
  merch_type_id: string | null;
  display_order: number;
  created_at: string;
}

interface MerchType {
  id: string;
  slug: string;
  label: string;
}

export default function AdminMerchPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [pendingOrders, setPendingOrders] = useState(0);
  const [merchTypes, setMerchTypes] = useState<MerchType[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [savingTypeFor, setSavingTypeFor] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<AdminSortKey>("featured");

  const visibleProducts = useMemo(() => {
    let out = products;
    if (typeFilter === "uncategorized") {
      out = out.filter((p) => p.merch_type_id === null);
    } else if (typeFilter !== "all") {
      out = out.filter((p) => p.merch_type_id === typeFilter);
    }
    return [...out].sort((a, b) => {
      switch (sortKey) {
        case "oldest":
          return a.created_at.localeCompare(b.created_at);
        case "title_asc":
          return a.title.localeCompare(b.title);
        case "price_asc": {
          const ap = a.price ?? Number.POSITIVE_INFINITY;
          const bp = b.price ?? Number.POSITIVE_INFINITY;
          return ap - bp;
        }
        case "price_desc": {
          const ap = a.price ?? Number.NEGATIVE_INFINITY;
          const bp = b.price ?? Number.NEGATIVE_INFINITY;
          return bp - ap;
        }
        case "newest":
          return b.created_at.localeCompare(a.created_at);
        case "featured":
        default: {
          if (a.display_order !== b.display_order) return a.display_order - b.display_order;
          return b.created_at.localeCompare(a.created_at);
        }
      }
    });
  }, [products, typeFilter, sortKey]);


  const hasUncategorized = useMemo(
    () => products.some((p) => p.merch_type_id === null),
    [products],
  );

  const fetchData = useCallback(async () => {
    const [prodRes, ordRes, typesRes] = await Promise.all([
      fetch("/api/admin/products"),
      fetch("/api/admin/orders?status=pending_review&limit=1"),
      fetch("/api/admin/merch-types"),
    ]);
    setProducts(await prodRes.json());
    const ord = await ordRes.json();
    setPendingOrders(ord.total || 0);
    const types = await typesRes.json();
    setMerchTypes(Array.isArray(types) ? types : []);
    setLoading(false);
  }, []);

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/admin/printify/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setSyncResult(
          `Sync failed: ${data.error || "unknown"}` +
          (data.hint ? ` — ${data.hint}` : ""),
        );
      } else {
        setSyncResult(
          `Fetched ${data.fetched}, created ${data.created}, skipped ${data.skipped ?? 0} existing` +
          (data.errors?.length ? ` (${data.errors.length} errors)` : ""),
        );
        fetchData();
      }
    } catch (err) {
      setSyncResult(`Sync failed: ${(err as Error).message}`);
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleTypeChange(productId: string, value: string) {
    const next = value || null;
    setSavingTypeFor(productId);
    setProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, merch_type_id: next } : p)),
    );
    const res = await fetch(`/api/admin/products/${productId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ merch_type_id: next }),
    });
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: "Save failed" }));
      alert(`Could not update type: ${error || "unknown error"}`);
      await fetchData();
    }
    setSavingTypeFor(null);
  }

  if (loading) {
    return (
      <div className="admin-page">
        <p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>Loading...</p>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">Merch</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className="admin-btn admin-btn--secondary"
            onClick={handleSync}
            disabled={syncing}
          >
            {syncing ? "Importing…" : "Import new from Printify"}
          </button>
          <Link href="/admin/merch/products/new" className="admin-btn admin-btn--primary">
            New Product
          </Link>
        </div>
      </div>

      {syncResult && (
        <p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)", fontSize: 13, marginTop: 0 }}>
          {syncResult}
        </p>
      )}

      <div className="admin-stats">
        <div className="admin-stats__card">
          <span className="admin-stats__value">{products.length}</span>
          <span className="admin-stats__label">Total Products</span>
        </div>
        <div className={`admin-stats__card${pendingOrders > 0 ? " admin-stats__card--warn" : ""}`}>
          <span className="admin-stats__value">{pendingOrders}</span>
          <span className="admin-stats__label">Pending Review</span>
        </div>
      </div>

      {/* Quick links */}
      <div style={{ display: "flex", gap: 8, marginBottom: "var(--space-xl)" }}>
        <Link href="/admin/merch/orders" className="admin-btn admin-btn--secondary">
          All Orders
        </Link>
        <Link href="/admin/merch/orders?status=pending_review" className="admin-btn admin-btn--secondary">
          Pending Review ({pendingOrders})
        </Link>
        <Link href="/admin/merch/types" className="admin-btn admin-btn--secondary">
          Merch Types
        </Link>
        <Link href="/admin/merch/order" className="admin-btn admin-btn--secondary">
          Reorder (Visual)
        </Link>
      </div>

      {/* Filter + sort */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: "var(--space-md)", flexWrap: "wrap" }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontFamily: "var(--font-ui)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.16em", color: "var(--text-tertiary)" }}>Type</span>
          <select
            className="obsv-editor__input"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            style={{ minWidth: 160, padding: "4px 8px" }}
          >
            <option value="all">All ({products.length})</option>
            {merchTypes.map((t) => {
              const n = products.filter((p) => p.merch_type_id === t.id).length;
              return (
                <option key={t.id} value={t.id}>{t.label} ({n})</option>
              );
            })}
            {hasUncategorized && (
              <option value="uncategorized">
                Uncategorized ({products.filter((p) => p.merch_type_id === null).length})
              </option>
            )}
          </select>
        </label>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontFamily: "var(--font-ui)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.16em", color: "var(--text-tertiary)" }}>Sort</span>
          <select
            className="obsv-editor__input"
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as AdminSortKey)}
            style={{ minWidth: 160, padding: "4px 8px" }}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <span style={{ marginLeft: "auto", fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--text-tertiary)" }}>
          Showing {visibleProducts.length} of {products.length}
        </span>
      </div>

      {/* Products table */}
      <table className="admin-table">
        <thead>
          <tr>
            <th className="admin-table__th">Title</th>
            <th className="admin-table__th">Type</th>
            <th className="admin-table__th">Fulfillment</th>
            <th className="admin-table__th">Price</th>
            <th className="admin-table__th">Status</th>
            <th className="admin-table__th">Printify</th>
          </tr>
        </thead>
        <tbody>
          {visibleProducts.length === 0 && (
            <tr>
              <td className="admin-table__td admin-table__td--empty" colSpan={6}>
                {products.length === 0 ? "No products yet." : "No products match the current filter."}
              </td>
            </tr>
          )}
          {visibleProducts.map((p) => {
            const saving = savingTypeFor === p.id;
            return (
            <tr key={p.id} className="admin-table__row">
              <td className="admin-table__td">
                <Link href={`/admin/merch/products/${p.slug || p.id}`} className="admin-table__link">
                  {p.title}
                </Link>
                {p.slug && (
                  <div style={{ fontSize: 12, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", marginTop: 2 }}>
                    /{p.slug}
                  </div>
                )}
              </td>
              <td className="admin-table__td">
                <select
                  className="admin-meta-form__inline-input"
                  value={p.merch_type_id ?? ""}
                  disabled={saving}
                  onChange={(e) => handleTypeChange(p.id, e.target.value)}
                  style={{ minWidth: 140 }}
                >
                  <option value="">-- uncategorized --</option>
                  {merchTypes.map((t) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
              </td>
              <td className="admin-table__td">
                <span className="admin-meta-chip">{p.fulfillment === "manual" ? "Manual" : "Curated"}</span>
              </td>
              <td className="admin-table__td">
                {p.price ? `$${Number(p.price).toFixed(2)}` : "--"}
              </td>
              <td className="admin-table__td">
                <span className={`admin-status admin-status--${p.status === "active" ? "published" : p.status === "inactive" ? "draft" : "private"}`}>
                  {p.status}
                </span>
              </td>
              <td className="admin-table__td admin-table__td--indicator">
                <span className={p.printify_product_id ? "admin-check" : "admin-dash"}>
                  {p.printify_product_id ? "\u2713" : "\u2014"}
                </span>
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
