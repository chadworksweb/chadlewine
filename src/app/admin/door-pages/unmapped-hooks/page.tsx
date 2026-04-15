"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Song {
  id: string;
  title: string;
  slug: string;
  status: string;
}

interface UnmappedHook {
  hook: string;
  songs: Song[];
}

export default function UnmappedHooksPage() {
  const router = useRouter();
  const [rows, setRows] = useState<UnmappedHook[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/unmapped-hooks")
      .then((r) => r.json())
      .then((data) => {
        setRows(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function createDoor(hook: string, songIds: string[]) {
    setBusy(hook);
    setError("");
    const res = await fetch("/api/admin/door-pages/from-hook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hook, song_ids: songIds }),
    });
    setBusy(null);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Create failed");
      return;
    }
    const d = await res.json();
    router.push(`/admin/door-pages/${d.id}`);
  }

  if (loading) {
    return (
      <div className="admin-page">
        <p style={{ color: "#888" }}>Loading unmapped hooks...</p>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">Unmapped Hooks</h1>
        <Link href="/admin/door-pages" className="admin-btn">← Door Pages</Link>
      </div>

      <p style={{ color: "#666", marginTop: 0 }}>
        Hook key-points from song visibility sections that don&apos;t yet appear as a target query on any door page.
        Create a door to intercept the search query.
      </p>

      {error && <p style={{ color: "#c22" }}>{error}</p>}

      {rows.length === 0 ? (
        <p style={{ color: "#888", marginTop: 24 }}>
          Every hook is mapped to at least one door page. Nothing to surface.
        </p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th className="admin-table__th">Hook</th>
              <th className="admin-table__th"># Songs</th>
              <th className="admin-table__th">Source Songs</th>
              <th className="admin-table__th"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.hook} className="admin-table__row">
                <td className="admin-table__td">{row.hook}</td>
                <td className="admin-table__td admin-table__td--date">{row.songs.length}</td>
                <td className="admin-table__td">
                  {row.songs.map((s, i) => (
                    <span key={s.id}>
                      <Link href={`/admin/music/songs/${s.slug}`} className="admin-table__link">
                        {s.title}
                      </Link>
                      {i < row.songs.length - 1 ? ", " : ""}
                    </span>
                  ))}
                </td>
                <td className="admin-table__td">
                  <button
                    className="admin-btn admin-btn--primary"
                    onClick={() => createDoor(row.hook, row.songs.map((s) => s.id))}
                    disabled={busy === row.hook}
                  >
                    {busy === row.hook ? "Creating..." : "Create door"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
