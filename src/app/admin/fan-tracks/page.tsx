import Link from "next/link";
import { createAdminClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

interface Row {
  id: string;
  slug: string;
  title: string;
  artist_credit: string;
  duration_seconds: number | null;
  is_published: boolean;
  published_at: string | null;
  created_at: string;
}

function fmt(date: string | null): string {
  if (!date) return "-";
  try {
    return new Date(date).toLocaleDateString();
  } catch {
    return "-";
  }
}

function fmtDuration(seconds: number | null): string {
  if (!seconds) return "-";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export default async function FanTracksAdminPage() {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("fan_tracks")
    .select(
      "id, slug, title, artist_credit, duration_seconds, is_published, published_at, created_at",
    )
    .order("created_at", { ascending: false });

  const rows: Row[] = (data as Row[]) || [];

  // Grant counts per track so the list view shows reach at a glance.
  const grantCountByTrack = new Map<string, number>();
  if (rows.length > 0) {
    const { data: gs } = await supabase
      .from("fan_track_grants")
      .select("fan_track_id")
      .in("fan_track_id", rows.map((r) => r.id));
    for (const g of gs || []) {
      grantCountByTrack.set(g.fan_track_id, (grantCountByTrack.get(g.fan_track_id) ?? 0) + 1);
    }
  }

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <div>
          <h1 className="admin-page__title">For my fans</h1>
          <p className="admin-page__sub">
            Gated tracks. Buyers earn lifetime access; share happens only on
            purchase + publish.
          </p>
        </div>
      </div>

      <section className="admin-page__body">
        {rows.length === 0 ? (
          <p className="admin-page__hint">
            No fan tracks yet. Use{" "}
            <code>npx tsx scripts/ingest-fan-track.ts</code> to upload a master
            and create the first row.
          </p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th className="admin-table__th">Title</th>
                <th className="admin-table__th">Slug</th>
                <th className="admin-table__th">Duration</th>
                <th className="admin-table__th">Status</th>
                <th className="admin-table__th">Grants</th>
                <th className="admin-table__th">Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="admin-table__row">
                  <td className="admin-table__td">
                    <Link
                      href={`/admin/fan-tracks/${r.slug}`}
                      className="admin-table__link"
                    >
                      {r.title}
                    </Link>
                  </td>
                  <td className="admin-table__td">
                    <code>{r.slug}</code>
                  </td>
                  <td className="admin-table__td">{fmtDuration(r.duration_seconds)}</td>
                  <td className="admin-table__td">
                    <span
                      className={`admin-status admin-status--${r.is_published ? "published" : "draft"}`}
                    >
                      {r.is_published ? "published" : "draft"}
                    </span>
                  </td>
                  <td className="admin-table__td">{grantCountByTrack.get(r.id) ?? 0}</td>
                  <td className="admin-table__td admin-table__td--date">
                    {fmt(r.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
