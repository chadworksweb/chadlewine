import { createAdminClient } from "@/lib/supabase-server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveDoorPageId(
  supabase: ReturnType<typeof createAdminClient>,
  idOrSlug: string,
): Promise<string | null> {
  if (UUID_RE.test(idOrSlug)) return idOrSlug;
  const { data } = await supabase.from("door_pages").select("id").eq("slug", idOrSlug).maybeSingle();
  return data?.id ?? null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idOrSlug } = await params;
  const supabase = createAdminClient();
  const id = await resolveDoorPageId(supabase, idOrSlug);
  if (!id) return Response.json({ error: "Door page not found" }, { status: 404 });
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
  const { id: idOrSlug } = await params;
  const supabase = createAdminClient();
  const id = await resolveDoorPageId(supabase, idOrSlug);
  if (!id) return Response.json({ error: "Door page not found" }, { status: 404 });
  const { song_ids } = (await request.json()) as { song_ids: string[] };
  if (!Array.isArray(song_ids)) {
    return Response.json({ error: "song_ids must be an array" }, { status: 400 });
  }

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
