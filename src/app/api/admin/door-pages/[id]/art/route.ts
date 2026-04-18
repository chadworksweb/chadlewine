import { createAdminClient } from "@/lib/supabase-server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("door_page_art")
    .select("position, art:art_pieces(id, title, slug, image_path, status)")
    .eq("door_page_id", id)
    .order("position");

  if (error) return Response.json({ error: error.message }, { status: 500 });
  const flat = (data || []).map((row: { position: number; art: unknown }) => ({
    ...(row.art as Record<string, unknown>),
    position: row.position,
  }));
  return Response.json(flat);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { art_ids } = (await request.json()) as { art_ids: string[] };
  if (!Array.isArray(art_ids)) {
    return Response.json({ error: "art_ids must be an array" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { error: delErr } = await supabase
    .from("door_page_art")
    .delete()
    .eq("door_page_id", id);
  if (delErr) return Response.json({ error: delErr.message }, { status: 500 });

  if (art_ids.length > 0) {
    const rows = art_ids.map((art_id, position) => ({
      door_page_id: id,
      art_id,
      position,
    }));
    const { error: insErr } = await supabase.from("door_page_art").insert(rows);
    if (insErr) return Response.json({ error: insErr.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}
