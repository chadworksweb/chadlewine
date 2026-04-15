import { createAdminClient } from "@/lib/supabase-server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("door_page_songs")
    .select("position, song:songs(id, title, slug, art_image_path, status)")
    .eq("door_page_id", id)
    .order("position");

  if (error) return Response.json({ error: error.message }, { status: 500 });
  const flat = (data || []).map((row: { position: number; song: unknown }) => ({
    ...(row.song as Record<string, unknown>),
    position: row.position,
  }));
  return Response.json(flat);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { song_ids } = (await request.json()) as { song_ids: string[] };
  if (!Array.isArray(song_ids)) {
    return Response.json({ error: "song_ids must be an array" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { error: delErr } = await supabase
    .from("door_page_songs")
    .delete()
    .eq("door_page_id", id);
  if (delErr) return Response.json({ error: delErr.message }, { status: 500 });

  if (song_ids.length > 0) {
    const rows = song_ids.map((song_id, position) => ({
      door_page_id: id,
      song_id,
      position,
    }));
    const { error: insErr } = await supabase.from("door_page_songs").insert(rows);
    if (insErr) return Response.json({ error: insErr.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}
