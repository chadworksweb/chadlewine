"use client";

import { useState, useEffect, useCallback } from "react";
import { formatDate } from "@/lib/utils";

interface Submission {
  id: string;
  buyer_email: string;
  product_config: Record<string, unknown>;
  printify_order_id: string | null;
  status: string;
  reviewed_at: string | null;
  created_at: string;
}

export default function AdminMerchQueuePage() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const res = await fetch("/api/admin/merch-queue");
    setSubmissions(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleReview(id: string, status: "approved" | "passed") {
    await fetch(`/api/admin/merch-queue/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    fetchData();
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
        <h1 className="admin-page__title">Merch Review Queue</h1>
      </div>

      <table className="admin-table">
        <thead>
          <tr>
            <th className="admin-table__th">Buyer</th>
            <th className="admin-table__th">Config</th>
            <th className="admin-table__th">Status</th>
            <th className="admin-table__th">Submitted</th>
            <th className="admin-table__th">Actions</th>
          </tr>
        </thead>
        <tbody>
          {submissions.length === 0 && (
            <tr>
              <td className="admin-table__td admin-table__td--empty" colSpan={5}>No submissions.</td>
            </tr>
          )}
          {submissions.map((sub) => (
            <tr key={sub.id} className="admin-table__row">
              <td className="admin-table__td">{sub.buyer_email}</td>
              <td className="admin-table__td">
                <pre style={{ fontSize: "0.7rem", maxWidth: 300, overflow: "auto", margin: 0 }}>
                  {JSON.stringify(sub.product_config, null, 2)}
                </pre>
              </td>
              <td className="admin-table__td">
                <span className={`admin-status admin-status--${sub.status === "approved" ? "published" : sub.status === "passed" ? "trash" : "private"}`}>
                  {sub.status}
                </span>
              </td>
              <td className="admin-table__td admin-table__td--date">{formatDate(sub.created_at)}</td>
              <td className="admin-table__td">
                {sub.status === "pending" && (
                  <div style={{ display: "flex", gap: 4 }}>
                    <button
                      className="admin-btn admin-btn--small admin-btn--primary"
                      onClick={() => handleReview(sub.id, "approved")}
                    >
                      Approve
                    </button>
                    <button
                      className="admin-btn admin-btn--small admin-btn--danger"
                      onClick={() => handleReview(sub.id, "passed")}
                    >
                      Pass
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
