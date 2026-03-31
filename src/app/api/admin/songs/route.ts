import { createAdminClient } from "@/lib/supabase-server";
import { slugify } from "@/lib/utils";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const albumId = searchParams.get("album_id");
  const supabase = createAdminClient();

  if (albumId) {
    // Get songs for a specific album via junction
    const { data, error } = await supabase
      .from("album_songs")
      .select("track_number, song:songs(*)")
      .eq("album_id", albumId)
      .order("track_number");
    if (error) return Response.json({ error: error.message }, { status: 500 });
    const flat = (data || []).map((row: any) => ({ ...row.song, track_number: row.track_number }));
    return Response.json(flat);
  }

  const { data, error } = await supabase.from("songs").select("*").order("title");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function POST(request: Request) {
  const supabase = createAdminClient();
  const body = await request.json();
  if (!body.title) return Response.json({ error: "title required" }, { status: 400 });

  const { data: song, error } = await supabase.from("songs").insert({
    title: body.title.trim(),
    slug: body.slug?.trim() || slugify(body.title),
    duration_seconds: body.duration_seconds || null,
    streaming_path: body.streaming_path || null,
    download_path: body.download_path || null,
    lyrics: body.lyrics || null,
    price: body.price || null,
    is_single: body.is_single || false,
    status: body.status || "draft",
    release_date: body.release_date || null,
    song_summary: body.song_summary || null,
    isrc: body.isrc || null,
  }).select().single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Create junction row if album provided
  if (body.album_id && song) {
    const { error: jErr } = await supabase.from("album_songs").insert({
      album_id: body.album_id,
      song_id: song.id,
      track_number: body.track_number || 1,
    });
    if (jErr) return Response.json({ error: jErr.message }, { status: 500 });
  }

  return Response.json({ ...song, album_id: body.album_id, track_number: body.track_number || 1 }, { status: 201 });
}
