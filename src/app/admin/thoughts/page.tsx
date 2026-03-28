"use client";

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import { formatDate } from "@/lib/utils";

interface Thought {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  status: string;
  created_at: string;
}

export default function AdminThoughtsPage() {
  const [thoughts, setThoughts] = useState<Thought[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const res = await fetch("/api/admin/thoughts");
    setThoughts(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

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
        <h1 className="admin-page__title">Thoughts</h1>
        <Link href="/admin/thoughts/new" className="admin-btn admin-btn--primary">
          New Thought
        </Link>
      </div>

      <table className="admin-table">
        <thead>
          <tr>
            <th className="admin-table__th">Title</th>
            <th className="admin-table__th">Slug</th>
            <th className="admin-table__th">Status</th>
            <th className="admin-table__th">Created</th>
          </tr>
        </thead>
        <tbody>
          {thoughts.length === 0 && (
            <tr>
              <td className="admin-table__td admin-table__td--empty" colSpan={4}>No thoughts yet.</td>
            </tr>
          )}
          {thoughts.map((t) => (
            <tr key={t.id} className="admin-table__row">
              <td className="admin-table__td">
                <Link href={`/admin/thoughts/${t.id}`} className="admin-table__link">{t.title}</Link>
              </td>
              <td className="admin-table__td admin-table__td--date">/thoughts/{t.slug}</td>
              <td className="admin-table__td">
                <span className={`admin-status admin-status--${t.status}`}>{t.status}</span>
              </td>
              <td className="admin-table__td admin-table__td--date">{formatDate(t.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
