"use client";
import Link from "next/link";
import { useState, useEffect, useCallback } from "react";

interface Video { id: string; title: string; slug: string; status: string; is_featured: boolean; category_id: string | null; }

export default function AdminVideosPage() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => { const res = await fetch("/api/admin/videos"); setVideos(await res.json()); setLoading(false); }, []);
  useEffect(() => { fetchData(); }, [fetchData]);

  // Flip a video between published and hidden (draft). Hidden videos are
  // filtered out of every public surface (the /music-videos list + deep-link,
  // the sitemap, and JSON-LD all require status = 'published'), so this fully
  // hides the video and its attached metadata/page.
  const toggleStatus = useCallback(async (v: Video) => {
    const next = v.status === "published" ? "draft" : "published";
    setSavingId(v.id);
    setVideos((prev) => prev.map((x) => (x.id === v.id ? { ...x, status: next } : x)));
    try {
      const res = await fetch(`/api/admin/videos/${v.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) throw new Error("save failed");
    } catch {
      // Revert on failure.
      setVideos((prev) => prev.map((x) => (x.id === v.id ? { ...x, status: v.status } : x)));
    } finally {
      setSavingId(null);
    }
  }, []);

  if (loading) return <div className="admin-page"><p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>Loading...</p></div>;

  const publishedCount = videos.filter((v) => v.status === "published").length;

  return (
    <div className="admin-page">
      <div className="admin-page__header"><h1 className="admin-page__title">Videos</h1><Link href="/admin/videos/new" className="admin-btn admin-btn--primary">New Video</Link></div>
      <div className="admin-stats">
        <div className="admin-stats__card"><span className="admin-stats__value">{videos.length}</span><span className="admin-stats__label">Total</span></div>
        <div className="admin-stats__card"><span className="admin-stats__value">{publishedCount}</span><span className="admin-stats__label">Published</span></div>
        <div className="admin-stats__card"><span className="admin-stats__value">{videos.length - publishedCount}</span><span className="admin-stats__label">Hidden</span></div>
        <div className="admin-stats__card"><span className="admin-stats__value">{videos.filter(v => v.is_featured).length}</span><span className="admin-stats__label">Featured</span></div>
      </div>
      <table className="admin-table">
        <thead><tr><th className="admin-table__th">Title</th><th className="admin-table__th">Visibility</th><th className="admin-table__th">Featured</th></tr></thead>
        <tbody>
          {videos.map(v => {
            const on = v.status === "published";
            return (
              <tr key={v.id} className="admin-table__row">
                <td className="admin-table__td"><Link href={`/admin/videos/${v.slug || v.id}`} className="admin-table__link">{v.title}</Link></td>
                <td className="admin-table__td">
                  <button
                    type="button"
                    className={`admin-toggle${on ? " is-on" : ""}`}
                    onClick={() => toggleStatus(v)}
                    disabled={savingId === v.id}
                    role="switch"
                    aria-checked={on}
                    aria-label={`${v.title} is ${on ? "published" : "hidden"} -- click to ${on ? "hide" : "publish"}`}
                    title={on ? "Published -- click to hide" : "Hidden -- click to publish"}
                  >
                    <span className="admin-toggle__track" aria-hidden="true"><span className="admin-toggle__knob" /></span>
                    <span className="admin-toggle__label">{on ? "Published" : "Hidden"}</span>
                  </button>
                </td>
                <td className="admin-table__td admin-table__td--indicator"><span className={v.is_featured ? "admin-check" : "admin-dash"}>{v.is_featured ? "\u2713" : "\u2014"}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
