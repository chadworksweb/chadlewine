import { createAdminClient } from "@/lib/supabase-server";

// Admin list of fan_tracks for the /admin/fan-tracks page.
// Proxy already enforces admin auth (src/proxy.ts).

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("fan_tracks")
    .select(
      "id, slug, title, artist_credit, duration_seconds, cover_art_path, hls_playlist_path, eligibility_rule, is_published, published_at, created_at",
    )
    .order("created_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Count grants per track for the list view.
  const ids = (data || []).map((t) => t.id);
  const grantCounts = new Map<string, number>();
  if (ids.length > 0) {
    const { data: counts } = await supabase
      .from("fan_track_grants")
      .select("fan_track_id")
      .in("fan_track_id", ids);
    for (const row of counts || []) {
      grantCounts.set(row.fan_track_id, (grantCounts.get(row.fan_track_id) ?? 0) + 1);
    }
  }

  return Response.json({
    items: (data || []).map((t) => ({
      ...t,
      grant_count: grantCounts.get(t.id) ?? 0,
    })),
  });
}
