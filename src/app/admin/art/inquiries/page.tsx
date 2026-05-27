"use client";
import Link from "next/link";
import { useState, useEffect, useCallback } from "react";

interface Inquiry {
  id: string;
  art_id: string | null;
  art_sku_id: string | null;
  buyer_name: string;
  buyer_email: string;
  message: string | null;
  status: string;
  admin_notes: string | null;
  created_at: string;
  art: { title: string; slug: string } | null;
  sku: { format: string; sku_code: string | null; price: number | null } | null;
}

const STATUSES = ["new", "responded", "reserved", "won", "lost", "closed"];

export default function AdminArtInquiriesPage() {
  const [rows, setRows] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/art-inquiries?status=${filter}`);
    setRows(res.ok ? await res.json() : []);
    setLoading(false);
  }, [filter]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- client-side data load
  useEffect(() => { load(); }, [load]);

  async function update(id: string, patch: Partial<Pick<Inquiry, "status" | "admin_notes">>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    await fetch(`/api/admin/art-inquiries/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  }

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">Art Inquiries</h1>
        <Link href="/admin/art" className="admin-btn">Back to Art</Link>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: "var(--space-md)", flexWrap: "wrap" }}>
        {["all", ...STATUSES].map((s) => (
          <button
            key={s}
            type="button"
            className={`admin-btn ${filter === s ? "admin-btn--primary" : ""}`}
            onClick={() => setFilter(s)}
            style={{ fontSize: "0.75rem", padding: "4px 12px", textTransform: "capitalize" }}
          >
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>Loading...</p>
      ) : rows.length === 0 ? (
        <p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>No inquiries.</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th className="admin-table__th">When</th>
              <th className="admin-table__th">Artwork</th>
              <th className="admin-table__th">Buyer</th>
              <th className="admin-table__th">Message</th>
              <th className="admin-table__th">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="admin-table__row">
                <td className="admin-table__td" style={{ whiteSpace: "nowrap" }}>
                  {new Date(r.created_at).toLocaleDateString()}
                </td>
                <td className="admin-table__td">
                  {r.art ? (
                    <Link href={`/admin/art/${r.art.slug}`} className="admin-table__link">{r.art.title}</Link>
                  ) : "(deleted)"}
                  {r.sku && (
                    <div style={{ fontSize: "0.7rem", color: "var(--text-tertiary)" }}>
                      {r.sku.format === "original" ? "Original" : "Limited print"}
                      {r.sku.price != null ? ` -- $${Number(r.sku.price).toFixed(2)}` : ""}
                    </div>
                  )}
                </td>
                <td className="admin-table__td">
                  {r.buyer_name}
                  <div style={{ fontSize: "0.7rem" }}>
                    <a href={`mailto:${r.buyer_email}`} className="admin-table__link">{r.buyer_email}</a>
                  </div>
                </td>
                <td className="admin-table__td" style={{ maxWidth: 360, whiteSpace: "pre-wrap" }}>{r.message || "--"}</td>
                <td className="admin-table__td">
                  <select
                    className="obsv-editor__input"
                    value={r.status}
                    onChange={(e) => update(r.id, { status: e.target.value })}
                    style={{ textTransform: "capitalize" }}
                  >
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
