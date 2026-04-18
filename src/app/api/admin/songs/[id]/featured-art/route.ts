import { createAdminClient } from "@/lib/supabase-server";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("songs_featured_art")
    .select("art_id, position, art:art_pieces(id, slug, title, image_path, image_alt, card_focal_x, card_focal_y, card_zoom, status)")
    .eq("song_id", id)
    .order("position");

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function PUT(request: Request, { params }: Ctx) {
  const { id } = await params;
  const supabase = createAdminClient();
  const body = await request.json();
  const artIds: string[] = Array.isArray(body.art_ids) ? body.art_ids.filter((v: unknown) => typeof v === "string") : [];

  const { error: delErr } = await supabase.from("songs_featured_art").delete().eq("song_id", id);
  if (delErr) return Response.json({ error: delErr.message }, { status: 500 });

  if (artIds.length > 0) {
    const rows = artIds.map((art_id, position) => ({ song_id: id, art_id, position }));
    const { error: insErr } = await supabase.from("songs_featured_art").insert(rows);
    if (insErr) return Response.json({ error: insErr.message }, { status: 500 });
  }

  return Response.json({ ok: true, count: artIds.length });
}
