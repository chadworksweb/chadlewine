import { createAdminClient } from "@/lib/supabase-server";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createAdminClient();
  const body = await request.json();
  const { label, slug } = body;

  const updates: Record<string, unknown> = {};
  if (label !== undefined) updates.label = label;
  if (slug !== undefined) updates.slug = slug;

  const { error } = await supabase
    .from("tags")
    .update(updates)
    .eq("id", id);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createAdminClient();

  // Check if any posts use this tag
  const { count } = await supabase
    .from("post_tags")
    .select("*", { count: "exact", head: true })
    .eq("tag_id", id);

  if (count && count > 0) {
    return Response.json(
      { error: `Cannot delete — ${count} post(s) use this tag. Reassign them first.` },
      { status: 409 }
    );
  }

  const { error } = await supabase.from("tags").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
