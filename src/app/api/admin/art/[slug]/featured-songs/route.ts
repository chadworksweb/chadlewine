import { createAdminClient } from "@/lib/supabase-server";

type Ctx = { params: Promise<{ slug: string }> };

async function resolveArtId(supabase: ReturnType<typeof createAdminClient>, slug: string) {
  const { data, error } = await supabase.from("art_pieces").select("id").eq("slug", slug).single();
  if (error || !data) return null;
  return data.id as string;
}

export async function GET(_req: Request, { params }: Ctx) {
  const { slug } = await params;
  const supabase = createAdminClient();

  const artId = await resolveArtId(supabase, slug);
  if (!artId) return Response.json({ error: "art piece not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("art_featured_songs")
    .select("song_id, position, song:songs(id, slug, title, art_image_path, art_alt, card_focal_x, card_focal_y, card_zoom, status)")
    .eq("art_id", artId)
    .order("position");

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function PUT(request: Request, { params }: Ctx) {
  const { slug } = await params;
  const supabase = createAdminClient();

  const artId = await resolveArtId(supabase, slug);
  if (!artId) return Response.json({ error: "art piece not found" }, { status: 404 });

  const body = await request.json();
  const songIds: string[] = Array.isArray(body.song_ids) ? body.song_ids.filter((v: unknown) => typeof v === "string") : [];

  const { error: delErr } = await supabase.from("art_featured_songs").delete().eq("art_id", artId);
  if (delErr) return Response.json({ error: delErr.message }, { status: 500 });

  if (songIds.length > 0) {
    const rows = songIds.map((song_id, position) => ({ song_id, art_id: artId, position }));
    const { error: insErr } = await supabase.from("art_featured_songs").insert(rows);
    if (insErr) return Response.json({ error: insErr.message }, { status: 500 });
  }

  return Response.json({ ok: true, count: songIds.length });
}
