import { createAdminClient } from "@/lib/supabase-server";

type Ctx = { params: Promise<{ slug: string; productId: string }> };

async function resolveArtId(supabase: ReturnType<typeof createAdminClient>, slug: string) {
  const { data, error } = await supabase.from("art_pieces").select("id").eq("slug", slug).single();
  if (error || !data) return null;
  return data.id as string;
}

export async function PATCH(request: Request, { params }: Ctx) {
  const { slug, productId } = await params;
  const supabase = createAdminClient();

  const artId = await resolveArtId(supabase, slug);
  if (!artId) return Response.json({ error: "art piece not found" }, { status: 404 });

  const body = await request.json();

  const updates: Record<string, unknown> = {};
  if ("variant_label" in body) updates.variant_label = body.variant_label || null;
  if ("price" in body) {
    const p = body.price;
    updates.price = typeof p === "number" ? p : p ? parseFloat(p) : null;
  }
  if ("edition_size" in body) {
    const e = body.edition_size;
    updates.edition_size = typeof e === "number" ? e : e ? parseInt(e) : 0;
  }
  if ("editions_sold" in body) {
    const s = body.editions_sold;
    const parsed = typeof s === "number" ? s : s ? parseInt(s) : 0;
    updates.editions_sold = Math.max(0, parsed);
  }
  if ("status" in body) updates.status = body.status;

  if ("variant_label" in updates || "title" in body) {
    const { data: current } = await supabase
      .from("merch")
      .select("variant_type, title")
      .eq("id", productId)
      .eq("source_art_id", artId)
      .single();
    const { data: art } = await supabase.from("art_pieces").select("title").eq("id", artId).single();
    if (current && art) {
      const label = (updates.variant_label as string | null) ?? (current.variant_type === "original" ? "Original" : "Print");
      updates.title = [art.title, label].filter(Boolean).join(" — ");
    }
  }

  const { data, error } = await supabase
    .from("merch")
    .update(updates)
    .eq("id", productId)
    .eq("source_art_id", artId)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { slug, productId } = await params;
  const supabase = createAdminClient();

  const artId = await resolveArtId(supabase, slug);
  if (!artId) return Response.json({ error: "art piece not found" }, { status: 404 });

  const { error } = await supabase
    .from("merch")
    .delete()
    .eq("id", productId)
    .eq("source_art_id", artId);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
