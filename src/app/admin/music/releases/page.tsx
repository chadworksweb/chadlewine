"use client";

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import { releaseTypeLabel } from "@/lib/release-labels";

interface Album {
  id: string;
  title: string;
  slug: string;
  status: string;
  display_order: number;
  release_date: string | null;
  release_type: string | null;
}

type SortKey = "title" | "status" | "release_date" | "display_order" | "release_type";
type SortDir = "asc" | "desc";

export default function AdminAlbumsPage() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [songCounts, setSongCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("release_date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const fetchData = useCallback(async () => {
    const res = await fetch("/api/admin/releases");
    const data: Album[] = await res.json();
    setAlbums(data);

    const counts: Record<string, number> = {};
    await Promise.all(
      data.map(async (album) => {
        const sRes = await fetch(`/api/admin/songs?release_id=${album.id}`);
        const songs = await sRes.json();
        counts[album.id] = songs.length;
      })
    );
    setSongCounts(counts);
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- client-side data load on mount
  useEffect(() => { fetchData(); }, [fetchData]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const sorted = [...albums].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    const av = a[sortKey];
    const bv = b[sortKey];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dir;
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
    return 0;
  });

  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ▲" : " ▼";
  }

  if (loading) return <div className="admin-page"><p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>Loading...</p></div>;

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">Releases</h1>
        <Link href="/admin/music/releases/new" className="admin-btn admin-btn--primary">New Release</Link>
      </div>

      <div className="admin-stats" style={{ marginBottom: "var(--space-xl)" }}>
        <div className="admin-stats__card"><span className="admin-stats__value">{albums.length}</span><span className="admin-stats__label">Total</span></div>
        <div className="admin-stats__card"><span className="admin-stats__value">{albums.filter(a => a.status === "published").length}</span><span className="admin-stats__label">Published</span></div>
      </div>

      <table className="admin-table">
        <thead>
          <tr>
            <th className="admin-table__th admin-table__th--sortable" onClick={() => handleSort("title")}>Title{sortIndicator("title")}</th>
            <th className="admin-table__th admin-table__th--sortable" onClick={() => handleSort("release_type")}>Type{sortIndicator("release_type")}</th>
            <th className="admin-table__th">Songs</th>
            <th className="admin-table__th admin-table__th--sortable" onClick={() => handleSort("status")}>Status{sortIndicator("status")}</th>
            <th className="admin-table__th admin-table__th--sortable" onClick={() => handleSort("release_date")}>Release{sortIndicator("release_date")}</th>
            <th className="admin-table__th admin-table__th--sortable" onClick={() => handleSort("display_order")}>Order{sortIndicator("display_order")}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((a) => (
            <tr key={a.id} className="admin-table__row">
              <td className="admin-table__td"><Link href={`/admin/music/releases/${a.slug || a.id}`} className="admin-table__link">{a.title}</Link></td>
              <td className="admin-table__td"><span style={{ fontFamily: "var(--font-ui)", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.04em", padding: "2px 8px", borderRadius: 4, background: "rgba(167, 139, 250, 0.14)", color: "#c4b5fd" }}>{releaseTypeLabel(a.release_type) || "—"}</span></td>
              <td className="admin-table__td">{songCounts[a.id] || 0}</td>
              <td className="admin-table__td"><span className={`admin-status admin-status--${a.status}`}>{a.status}</span></td>
              <td className="admin-table__td admin-table__td--date">{a.release_date || "—"}</td>
              <td className="admin-table__td">{a.display_order}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
