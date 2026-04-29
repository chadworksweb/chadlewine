"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatDate } from "@/lib/utils";

type Status =
  | "pending_review"
  | "approved"
  | "in_production"
  | "shipped"
  | "delivered"
  | "completed"
  | "cancelled"
  | "refunded";

interface Order {
  id: string;
  order_number: string;
  status: Status;
  buyer_email: string;
  buyer_name: string | null;
  total: number;
  has_printify_lines: boolean;
  has_digital_lines: boolean;
  printify_order_id: string | null;
  tracking_number: string | null;
  created_at: string;
}

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: "", label: "All" },
  { value: "pending_review", label: "Pending Review" },
  { value: "approved", label: "Approved" },
  { value: "in_production", label: "In Production" },
  { value: "shipped", label: "Shipped" },
  { value: "delivered", label: "Delivered" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "refunded", label: "Refunded" },
];

function statusClass(s: Status): string {
  switch (s) {
    case "pending_review": return "admin-status--private";
    case "approved": return "admin-status--draft";
    case "in_production": return "admin-status--draft";
    case "shipped": return "admin-status--published";
    case "delivered": return "admin-status--published";
    case "completed": return "admin-status--published";
    case "cancelled": return "admin-status--trash";
    case "refunded": return "admin-status--trash";
    default: return "admin-status--private";
  }
}

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const qs = new URLSearchParams();
      qs.set("page", String(page));
      qs.set("limit", "25");
      if (search) qs.set("search", search);
      if (statusFilter) qs.set("status", statusFilter);
      const res = await fetch(`/api/admin/orders?${qs.toString()}`);
      const data = await res.json();
      if (cancelled) return;
      setOrders(data.orders || []);
      setTotal(data.total || 0);
      setPages(data.pages || 1);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [page, search, statusFilter]);

  const pendingCount = orders.filter((o) => o.status === "pending_review").length;

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">Orders</h1>
        <Link href="/admin/merch" className="admin-btn admin-btn--secondary">
          ← Back to Merch
        </Link>
      </div>

      <div className="admin-stats">
        <div className="admin-stats__card">
          <span className="admin-stats__value">{total}</span>
          <span className="admin-stats__label">Total{statusFilter ? ` (${statusFilter.replace("_", " ")})` : ""}</span>
        </div>
        {!statusFilter && pendingCount > 0 && (
          <div className="admin-stats__card admin-stats__card--warn">
            <span className="admin-stats__value">{pendingCount}</span>
            <span className="admin-stats__label">Pending Review (this page)</span>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: "var(--space-lg)", flexWrap: "wrap" }}>
        <input
          type="search"
          placeholder="Search email, order #, name…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="admin-input"
          style={{ flex: 1, minWidth: 240, padding: "8px 12px", fontFamily: "var(--font-ui)" }}
        />
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          style={{ padding: "8px 12px", fontFamily: "var(--font-ui)" }}
        >
          {STATUS_FILTERS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>Loading...</p>
      ) : (
        <>
          <table className="admin-table">
            <thead>
              <tr>
                <th className="admin-table__th">Order</th>
                <th className="admin-table__th">Customer</th>
                <th className="admin-table__th">Email</th>
                <th className="admin-table__th">Total</th>
                <th className="admin-table__th">Composition</th>
                <th className="admin-table__th">Status</th>
                <th className="admin-table__th">Date</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 && (
                <tr>
                  <td className="admin-table__td admin-table__td--empty" colSpan={7}>
                    No orders match.
                  </td>
                </tr>
              )}
              {orders.map((o) => (
                <tr key={o.id} className="admin-table__row">
                  <td className="admin-table__td">
                    <Link href={`/admin/merch/orders/${o.order_number || o.id}`} className="admin-table__link">
                      {o.order_number}
                    </Link>
                  </td>
                  <td className="admin-table__td">{o.buyer_name || "—"}</td>
                  <td className="admin-table__td">{o.buyer_email}</td>
                  <td className="admin-table__td">${Number(o.total).toFixed(2)}</td>
                  <td className="admin-table__td">
                    {o.has_printify_lines && <span className="admin-meta-chip">Printify</span>}
                    {o.has_digital_lines && <span className="admin-meta-chip">Digital</span>}
                  </td>
                  <td className="admin-table__td">
                    <span className={`admin-status ${statusClass(o.status)}`}>
                      {o.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="admin-table__td admin-table__td--date">
                    {formatDate(o.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {pages > 1 && (
            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: "var(--space-lg)" }}>
              <button
                className="admin-btn admin-btn--secondary"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                ← Prev
              </button>
              <span style={{ alignSelf: "center", color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>
                Page {page} of {pages}
              </span>
              <button
                className="admin-btn admin-btn--secondary"
                disabled={page >= pages}
                onClick={() => setPage(page + 1)}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
