"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { routeToSlug } from "@/lib/managed-pages";

interface Row {
  route: string;
  label: string;
  meta: {
    title: string | null;
    description: string | null;
    og_image_path: string | null;
  } | null;
}

export default function AdminPagesList() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/page-meta")
      .then((r) => r.json())
      .then((data) => {
        setRows(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

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
        <h1 className="admin-page__title">Pages</h1>
      </div>
      <p style={{ color: "#666", marginTop: 0 }}>
        Meta overrides for non-entity pages. Blank fields fall back to hardcoded defaults.
      </p>

      <table className="admin-table">
        <thead>
          <tr>
            <th className="admin-table__th">Page</th>
            <th className="admin-table__th">Route</th>
            <th className="admin-table__th">Title Override</th>
            <th className="admin-table__th">Description Override</th>
            <th className="admin-table__th">OG Image</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.route} className="admin-table__row">
              <td className="admin-table__td">
                <Link href={`/admin/pages/${routeToSlug(row.route)}`} className="admin-table__link">
                  {row.label}
                </Link>
              </td>
              <td className="admin-table__td admin-table__td--date">{row.route}</td>
              <td className="admin-table__td">
                {row.meta?.title ? (
                  row.meta.title
                ) : (
                  <span style={{ color: "#bbb" }}>— (using default)</span>
                )}
              </td>
              <td className="admin-table__td">
                {row.meta?.description ? (
                  <span style={{ color: "#444" }}>{row.meta.description.slice(0, 80)}{row.meta.description.length > 80 ? "…" : ""}</span>
                ) : (
                  <span style={{ color: "#bbb" }}>— (using default)</span>
                )}
              </td>
              <td className="admin-table__td admin-table__td--date">
                {row.meta?.og_image_path ? "✓" : <span style={{ color: "#bbb" }}>—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
