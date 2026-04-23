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

  const parentId = await resolveArtId(supabase, slug);
  if (!parentId) return Response.json({ error: "art piece not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("art_featured_art")
    .select("related_art_id, position, art:art_pieces!art_featured_art_related_art_id_fkey(id, slug, title, image_path, image_alt, card_focal_x, card_focal_y, card_zoom, status)")
    .eq("parent_art_id", parentId)
    .order("position");

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function PUT(request: Request, { params }: Ctx) {
  const { slug } = await params;
  const supabase = createAdminClient();

  const parentId = await resolveArtId(supabase, slug);
  if (!parentId) return Response.json({ error: "art piece not found" }, { status: 404 });

  const body = await request.json();
  const artIds: string[] = Array.isArray(body.art_ids)
    ? body.art_ids.filter((v: unknown) => typeof v === "string" && v !== parentId)
    : [];

  const { error: delErr } = await supabase.from("art_featured_art").delete().eq("parent_art_id", parentId);
  if (delErr) return Response.json({ error: delErr.message }, { status: 500 });

  if (artIds.length > 0) {
    const rows = artIds.map((related_art_id, position) => ({ parent_art_id: parentId, related_art_id, position }));
    const { error: insErr } = await supabase.from("art_featured_art").insert(rows);
    if (insErr) return Response.json({ error: insErr.message }, { status: 500 });
  }

  return Response.json({ ok: true, count: artIds.length });
}
