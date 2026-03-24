import { createAdminClient } from "@/lib/supabase-server";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createAdminClient();
  const body = await request.json();
  const { label, slug, sort_order } = body;

  const updates: Record<string, unknown> = {};
  if (label !== undefined) updates.label = label;
  if (slug !== undefined) updates.slug = slug;
  if (sort_order !== undefined) updates.sort_order = sort_order;

  const { error } = await supabase
    .from("domains")
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

  // Get the slug before deleting so we can report usage
  const { data: domain } = await supabase
    .from("domains")
    .select("slug")
    .eq("id", id)
    .single();

  if (!domain) {
    return Response.json({ error: "Domain not found" }, { status: 404 });
  }

  // Check if any observations use this domain
  const { count } = await supabase
    .from("observation_domains")
    .select("*", { count: "exact", head: true })
    .eq("domain_slug", domain.slug);

  if (count && count > 0) {
    return Response.json(
      { error: `Cannot delete — ${count} observation(s) use this domain. Reassign them first.` },
      { status: 409 }
    );
  }

  const { error } = await supabase.from("domains").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
