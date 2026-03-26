import { createAdminClient } from "@/lib/supabase-server";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createAdminClient();
  const body = await request.json();
  const { title, slug, description } = body;

  const updates: Record<string, unknown> = {};
  if (title !== undefined) updates.title = title;
  if (slug !== undefined) updates.slug = slug;
  if (description !== undefined) updates.description = description || null;

  const { error } = await supabase
    .from("thoughtlines")
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

  const { count } = await supabase
    .from("observation_thoughtlines")
    .select("*", { count: "exact", head: true })
    .eq("thoughtline_id", id);

  if (count && count > 0) {
    return Response.json(
      { error: `Cannot delete — ${count} observation(s) use this thoughtline. Reassign them first.` },
      { status: 409 }
    );
  }

  const { error } = await supabase.from("thoughtlines").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
