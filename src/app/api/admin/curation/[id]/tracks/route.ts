import { createAdminClient } from "@/lib/supabase-server";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("curated_playlist_tracks")
    .select("*")
    .eq("playlist_id", id)
    .order("display_order");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createAdminClient();
  const body = await request.json();
  if (!body.track_title) return Response.json({ error: "track_title required" }, { status: 400 });
  if (!body.artist_name) return Response.json({ error: "artist_name required" }, { status: 400 });

  const { data, error } = await supabase
    .from("curated_playlist_tracks")
    .insert({
      playlist_id: id,
      track_title: body.track_title.trim(),
      artist_name: body.artist_name.trim(),
      outbound_url: body.outbound_url || null,
      rising_compass_score: body.rising_compass_score || null,
      display_order: body.display_order || 0,
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data, { status: 201 });
}

export async function PUT(request: Request) {
  const supabase = createAdminClient();
  const body = await request.json();

  // Bulk update: expects array of { id, track_title, artist_name, outbound_url, rising_compass_score, display_order }
  if (!Array.isArray(body)) return Response.json({ error: "expected array" }, { status: 400 });

  for (const track of body) {
    await supabase
      .from("curated_playlist_tracks")
      .update({
        track_title: track.track_title,
        artist_name: track.artist_name,
        outbound_url: track.outbound_url || null,
        rising_compass_score: track.rising_compass_score || null,
        display_order: track.display_order,
      })
      .eq("id", track.id);
  }

  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const supabase = createAdminClient();
  const { searchParams } = new URL(request.url);
  const trackId = searchParams.get("trackId");
  if (!trackId) return Response.json({ error: "trackId required" }, { status: 400 });

  const { error } = await supabase.from("curated_playlist_tracks").delete().eq("id", trackId);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
