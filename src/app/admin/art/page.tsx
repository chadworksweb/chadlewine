"use client";
import Link from "next/link";
import { useState, useEffect, useCallback } from "react";

interface ArtPiece { id: string; title: string; slug: string; medium: string | null; image_path: string; status: string; display_order: number; }

export default function AdminArtPage() {
  const [pieces, setPieces] = useState<ArtPiece[]>([]);
  const [loading, setLoading] = useState(true);
  const fetchData = useCallback(async () => { const res = await fetch("/api/admin/art"); setPieces(await res.json()); setLoading(false); }, []);
  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <div className="admin-page"><p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>Loading...</p></div>;

  return (
    <div className="admin-page">
      <div className="admin-page__header"><h1 className="admin-page__title">Art Portfolio</h1><Link href="/admin/art/new" className="admin-btn admin-btn--primary">New Piece</Link></div>
      <div className="admin-stats">
        <div className="admin-stats__card"><span className="admin-stats__value">{pieces.length}</span><span className="admin-stats__label">Total</span></div>
        <div className="admin-stats__card"><span className="admin-stats__value">{pieces.filter(p => p.status === "published").length}</span><span className="admin-stats__label">Published</span></div>
      </div>
      <table className="admin-table">
        <thead><tr><th className="admin-table__th">Title</th><th className="admin-table__th">Medium</th><th className="admin-table__th">Status</th><th className="admin-table__th">Order</th></tr></thead>
        <tbody>
          {pieces.map(p => (
            <tr key={p.id} className="admin-table__row">
              <td className="admin-table__td"><Link href={`/admin/art/${p.slug}`} className="admin-table__link">{p.title}</Link></td>
              <td className="admin-table__td">{p.medium || "—"}</td>
              <td className="admin-table__td"><span className={`admin-status admin-status--${p.status}`}>{p.status}</span></td>
              <td className="admin-table__td">{p.display_order}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
