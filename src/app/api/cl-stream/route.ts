import { createPublicClient } from "@/lib/supabase-server";
import { fetchBadge } from "@/lib/rising-compass";

export const revalidate = 60;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);

  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("cl_stream_songs")
    .select("id, title, artist, album, note, source_url, created_at")
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const rows = data || [];
  // Attach live RC badge to every entry — RC owns the calibration; we never
  // persist a local copy on chadlewine.
  const badges = await Promise.all(rows.map((r) => fetchBadge(r.title, r.artist)));
  return Response.json(rows.map((r, i) => ({ ...r, badge: badges[i] })));
}
