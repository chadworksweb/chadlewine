import { createAdminClient } from "@/lib/supabase-server";

const RESERVED_SLUGS = new Set(["physical_music"]);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createAdminClient();
  const body = await request.json();

  const updates: Record<string, unknown> = {};
  if (typeof body.label === "string") updates.label = body.label.trim();
  if (typeof body.slug === "string") updates.slug = body.slug.trim();
  if (typeof body.sort_order === "number") updates.sort_order = body.sort_order;

  // Slug rename is blocked on reserved entries (physical_music is referenced
  // implicitly by release_skus.format -- changing the slug would silently
  // break the public storefront grouping).
  if (updates.slug) {
    const { data: current } = await supabase
      .from("merch_types")
      .select("slug")
      .eq("id", id)
      .maybeSingle();
    if (current && RESERVED_SLUGS.has(current.slug) && updates.slug !== current.slug) {
      return Response.json(
        { error: `Cannot rename slug of reserved type "${current.slug}".` },
        { status: 409 }
      );
    }
  }

  const { error } = await supabase.from("merch_types").update(updates).eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createAdminClient();

  const { data: current } = await supabase
    .from("merch_types")
    .select("slug")
    .eq("id", id)
    .maybeSingle();

  if (current && RESERVED_SLUGS.has(current.slug)) {
    return Response.json(
      { error: `Cannot delete reserved type "${current.slug}".` },
      { status: 409 }
    );
  }

  const { count } = await supabase
    .from("merch")
    .select("*", { count: "exact", head: true })
    .eq("merch_type_id", id);

  if (count && count > 0) {
    return Response.json(
      { error: `Cannot delete -- ${count} merch product(s) use this type. Reassign them first.` },
      { status: 409 }
    );
  }

  const { error } = await supabase.from("merch_types").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
