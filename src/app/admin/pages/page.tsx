"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface PageListItem {
  id: string;
  slug: string;
  title: string;
  template: string;
  status: "draft" | "published";
  parent_title: string | null;
  section_count: number;
  open_prompt_count: number;
}

export default function AdminPagesList() {
  const router = useRouter();
  const [rows, setRows] = useState<PageListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  function load() {
    fetch("/api/admin/pages")
      .then((r) => r.json())
      .then((data) => {
        setRows(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }

  useEffect(load, []);

  async function createPage() {
    setCreating(true);
    try {
      const res = await fetch("/api/admin/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Untitled Page", status: "draft" }),
      });
      const data = await res.json();
      if (res.ok && data?.id) {
        router.push(`/admin/pages/${data.id}`);
      } else {
        alert(data?.error || "Could not create page");
        setCreating(false);
      }
    } catch {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div className="admin-page">
        <p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>Loading...</p>
      </div>
    );
  }

  const totalOpen = rows.reduce((n, r) => n + r.open_prompt_count, 0);

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">Pages</h1>
        <button className="admin-btn admin-btn--primary" onClick={createPage} disabled={creating} type="button">
          {creating ? "Creating..." : "+ New Page"}
        </button>
      </div>
      <p style={{ color: "#666", marginTop: 0 }}>
        Standalone pages composed from typed sections. <strong>CMS</strong> pages render from the
        database; <strong>code</strong> pages still render from their route file (their SEO saves
        through the legacy override and takes effect immediately).
        {totalOpen > 0 && (
          <> {" "}<span className="admin-badge admin-badge--warn">{totalOpen} open prompts</span> across all pages.</>
        )}
      </p>

      <table className="admin-table">
        <thead>
          <tr>
            <th className="admin-table__th">Title</th>
            <th className="admin-table__th">Slug</th>
            <th className="admin-table__th">Parent</th>
            <th className="admin-table__th">Type</th>
            <th className="admin-table__th">Status</th>
            <th className="admin-table__th">Sections</th>
            <th className="admin-table__th">Prompts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="admin-table__row">
              <td className="admin-table__td">
                <Link href={`/admin/pages/${row.id}`} className="admin-table__link">
                  {row.title}
                </Link>
              </td>
              <td className="admin-table__td admin-table__td--date">/{row.slug}</td>
              <td className="admin-table__td">
                {row.parent_title ?? <span style={{ color: "#bbb" }}>—</span>}
              </td>
              <td className="admin-table__td">
                {row.template === "managed" ? (
                  <span className="admin-badge admin-badge--muted">code</span>
                ) : (
                  <span className="admin-badge">CMS</span>
                )}
              </td>
              <td className="admin-table__td">
                {row.status === "published" ? (
                  <span style={{ color: "var(--good, #22c55e)" }}>Published</span>
                ) : (
                  <span style={{ color: "#bbb" }}>Draft</span>
                )}
              </td>
              <td className="admin-table__td admin-table__td--date">{row.section_count || "—"}</td>
              <td className="admin-table__td">
                {row.open_prompt_count > 0 ? (
                  <span className="admin-badge admin-badge--warn">{row.open_prompt_count} open</span>
                ) : (
                  <span style={{ color: "#bbb" }}>—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
