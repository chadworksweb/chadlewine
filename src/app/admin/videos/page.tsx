"use client";
import Link from "next/link";
import { useState, useEffect, useCallback } from "react";

interface Video { id: string; title: string; slug: string; status: string; is_featured: boolean; category_id: string | null; }

export default function AdminVideosPage() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => { const res = await fetch("/api/admin/videos"); setVideos(await res.json()); setLoading(false); }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- client-side data load on mount
  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <div className="admin-page"><p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>Loading...</p></div>;

  return (
    <div className="admin-page">
      <div className="admin-page__header"><h1 className="admin-page__title">Videos</h1><Link href="/admin/videos/new" className="admin-btn admin-btn--primary">New Video</Link></div>
      <div className="admin-stats">
        <div className="admin-stats__card"><span className="admin-stats__value">{videos.length}</span><span className="admin-stats__label">Total</span></div>
        <div className="admin-stats__card"><span className="admin-stats__value">{videos.filter(v => v.is_featured).length}</span><span className="admin-stats__label">Featured</span></div>
      </div>
      <table className="admin-table">
        <thead><tr><th className="admin-table__th">Title</th><th className="admin-table__th">Status</th><th className="admin-table__th">Featured</th></tr></thead>
        <tbody>
          {videos.map(v => (
            <tr key={v.id} className="admin-table__row">
              <td className="admin-table__td"><Link href={`/admin/videos/${v.slug || v.id}`} className="admin-table__link">{v.title}</Link></td>
              <td className="admin-table__td"><span className={`admin-status admin-status--${v.status}`}>{v.status}</span></td>
              <td className="admin-table__td admin-table__td--indicator"><span className={v.is_featured ? "admin-check" : "admin-dash"}>{v.is_featured ? "\u2713" : "\u2014"}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
