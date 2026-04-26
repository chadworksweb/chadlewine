"use client";

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";

interface Product {
  id: string;
  tier: string;
  fulfillment: string;
  title: string;
  price: number | null;
  status: string;
  is_catalog_item: boolean;
  printify_product_id: string | null;
  created_at: string;
}

export default function AdminMerchPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [pendingOrders, setPendingOrders] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const [prodRes, ordRes] = await Promise.all([
      fetch("/api/admin/products"),
      fetch("/api/admin/orders?status=pending_review&limit=1"),
    ]);
    setProducts(await prodRes.json());
    const ord = await ordRes.json();
    setPendingOrders(ord.total || 0);
    setLoading(false);
  }, []);

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/admin/printify/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setSyncResult(`Sync failed: ${data.error || "unknown"}`);
      } else {
        setSyncResult(
          `Fetched ${data.fetched}, created ${data.created}, updated ${data.updated}` +
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

  if (loading) {
    return (
      <div className="admin-page">
        <p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>Loading...</p>
      </div>
    );
  }

  const tierCounts = products.reduce<Record<string, number>>((acc, p) => {
    acc[p.tier] = (acc[p.tier] || 0) + 1;
    return acc;
  }, {});

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
            {syncing ? "Syncing…" : "Sync from Printify"}
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
        {["art", "line", "fusion", "pick"].map((tier) => (
          <div key={tier} className="admin-stats__card">
            <span className="admin-stats__value">{tierCounts[tier] || 0}</span>
            <span className="admin-stats__label">{tier.charAt(0).toUpperCase() + tier.slice(1)}</span>
          </div>
        ))}
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
      </div>

      {/* Products table */}
      <table className="admin-table">
        <thead>
          <tr>
            <th className="admin-table__th">Title</th>
            <th className="admin-table__th">Tier</th>
            <th className="admin-table__th">Fulfillment</th>
            <th className="admin-table__th">Price</th>
            <th className="admin-table__th">Status</th>
            <th className="admin-table__th">Printify</th>
            <th className="admin-table__th">Catalog</th>
          </tr>
        </thead>
        <tbody>
          {products.length === 0 && (
            <tr>
              <td className="admin-table__td admin-table__td--empty" colSpan={7}>No products yet.</td>
            </tr>
          )}
          {products.map((p) => (
            <tr key={p.id} className="admin-table__row">
              <td className="admin-table__td">
                <Link href={`/admin/merch/products/${p.id}`} className="admin-table__link">
                  {p.title}
                </Link>
              </td>
              <td className="admin-table__td">
                <span className="admin-meta-chip">{p.tier}</span>
              </td>
              <td className="admin-table__td">
                <span className="admin-meta-chip">{p.fulfillment === "manual" ? "Manual" : p.fulfillment === "printify_curated" ? "Curated" : "Config"}</span>
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
              <td className="admin-table__td admin-table__td--indicator">
                <span className={p.is_catalog_item ? "admin-check" : "admin-dash"}>
                  {p.is_catalog_item ? "\u2713" : "\u2014"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
