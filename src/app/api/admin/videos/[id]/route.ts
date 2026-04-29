import { createAdminClient } from "@/lib/supabase-server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveVideoId(
  supabase: ReturnType<typeof createAdminClient>,
  idOrSlug: string,
): Promise<string | null> {
  if (UUID_RE.test(idOrSlug)) return idOrSlug;
  const { data } = await supabase.from("videos").select("id").eq("slug", idOrSlug).maybeSingle();
  return data?.id ?? null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: idOrSlug } = await params;
  const supabase = createAdminClient();
  const field = UUID_RE.test(idOrSlug) ? "id" : "slug";
  const { data, error } = await supabase.from("videos").select("*").eq(field, idOrSlug).single();
  if (error) return Response.json({ error: error.message }, { status: 404 });
  return Response.json(data);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: idOrSlug } = await params;
  const supabase = createAdminClient();
  const id = await resolveVideoId(supabase, idOrSlug);
  if (!id) return Response.json({ error: "Video not found" }, { status: 404 });
  const body = await request.json();
  const fields = ["title", "slug", "category_id", "stream_id", "embed_url", "thumbnail_path", "description", "duration_seconds", "is_featured", "status"];
  const updates: Record<string, unknown> = {};
  for (const f of fields) { if (f in body) updates[f] = body[f]; }
  if (body.status === "published") {
    const { data: existing } = await supabase.from("videos").select("published_at").eq("id", id).single();
    if (!existing?.published_at) updates.published_at = new Date().toISOString();
  }
  const { data, error } = await supabase.from("videos").update(updates).eq("id", id).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: idOrSlug } = await params;
  const supabase = createAdminClient();
  const id = await resolveVideoId(supabase, idOrSlug);
  if (!id) return Response.json({ error: "Video not found" }, { status: 404 });
  const { error } = await supabase.from("videos").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
