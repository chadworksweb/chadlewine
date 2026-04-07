import { createAdminClient } from "@/lib/supabase-server";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createAdminClient();

  const { data: song, error } = await supabase.from("songs").select("*").eq("id", id).single();
  if (error) return Response.json({ error: error.message }, { status: 404 });

  const { data: assoc } = await supabase
    .from("album_songs")
    .select("album_id, track_number")
    .eq("song_id", id)
    .single();

  return Response.json({
    ...song,
    album_id: assoc?.album_id || null,
    track_number: assoc?.track_number || null,
  });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createAdminClient();
  const body = await request.json();

  const songFields = ["title", "slug", "duration_seconds", "streaming_path", "download_path", "lyrics", "price", "is_single", "status", "release_date", "song_summary", "isrc", "playback_mode"];
  const updates: Record<string, unknown> = {};
  for (const f of songFields) { if (f in body) updates[f] = body[f]; }

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase.from("songs").update(updates).eq("id", id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }

  // Junction updates
  if ("album_id" in body || "track_number" in body) {
    const { data: existing } = await supabase
      .from("album_songs")
      .select("id, album_id, track_number")
      .eq("song_id", id)
      .single();

    const albumId = body.album_id ?? existing?.album_id;
    const trackNumber = body.track_number ?? existing?.track_number ?? 1;

    if (albumId) {
      if (existing) {
        await supabase.from("album_songs").update({ album_id: albumId, track_number: trackNumber }).eq("id", existing.id);
      } else {
        await supabase.from("album_songs").insert({ album_id: albumId, song_id: id, track_number: trackNumber });
      }
    }
  }

  const { data: song } = await supabase.from("songs").select("*").eq("id", id).single();
  const { data: assoc } = await supabase.from("album_songs").select("album_id, track_number").eq("song_id", id).single();

  return Response.json({ ...song, album_id: assoc?.album_id || null, track_number: assoc?.track_number || null });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createAdminClient();
  const { error } = await supabase.from("songs").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
