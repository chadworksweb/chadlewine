import { createAdminClient } from "@/lib/supabase-server";
import { fetchBadge } from "@/lib/rising-compass";

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("cl_stream_songs")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function POST(request: Request) {
  const supabase = createAdminClient();
  const body = await request.json();

  if (!body.title?.trim() || !body.artist?.trim()) {
    return Response.json({ error: "title and artist required" }, { status: 400 });
  }

  // Call Rising Compass for badge data — same as songs/albums
  const badge = await fetchBadge(body.title.trim(), body.artist.trim());

  const { data, error } = await supabase
    .from("cl_stream_songs")
    .insert({
      title: body.title.trim(),
      artist: body.artist.trim(),
      album: body.album?.trim() || null,
      album_art_url: body.album_art_url || null,
      note: body.note?.trim() || null,
      source_url: body.source_url || null,
      source_platform: body.source_platform || null,
      rc_color: badge?.tier ?? null,
      rc_charge: badge?.charge ?? null,
      rc_contaminated: badge?.contaminated ?? false,
      rc_charge_summary: badge?.charge_summary ?? null,
      status: "published",
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data, { status: 201 });
}
