import { createAdminClient } from "@/lib/supabase-server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveCollectionId(
  supabase: ReturnType<typeof createAdminClient>,
  idOrSlug: string,
): Promise<string | null> {
  if (UUID_RE.test(idOrSlug)) return idOrSlug;
  const { data } = await supabase
    .from("collections")
    .select("id")
    .eq("slug", idOrSlug)
    .maybeSingle();
  return data?.id ?? null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idOrSlug } = await params;
  const supabase = createAdminClient();
  const field = UUID_RE.test(idOrSlug) ? "id" : "slug";
  const { data, error } = await supabase
    .from("collections")
    .select("*")
    .eq(field, idOrSlug)
    .single();

  if (error) return Response.json({ error: error.message }, { status: 404 });
  return Response.json(data);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idOrSlug } = await params;
  const supabase = createAdminClient();
  const id = await resolveCollectionId(supabase, idOrSlug);
  if (!id) return Response.json({ error: "Collection not found" }, { status: 404 });
  const body = await request.json();

  const updates: Record<string, unknown> = {};
  const fields = ["slug", "title", "description", "status", "sort_order"];
  for (const f of fields) {
    if (f in body) updates[f] = body[f];
  }

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: "No updates provided" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("collections")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idOrSlug } = await params;
  const supabase = createAdminClient();
  const id = await resolveCollectionId(supabase, idOrSlug);
  if (!id) return Response.json({ error: "Collection not found" }, { status: 404 });

  const { error } = await supabase.from("collections").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
