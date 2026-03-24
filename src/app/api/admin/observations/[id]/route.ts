import { createAdminClient } from "@/lib/supabase-server";

// GET /api/admin/observations/[id] — get single observation with domains
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createAdminClient();

  const { data: observation, error } = await supabase
    .from("observations")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !observation) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const { data: domains } = await supabase
    .from("observation_domains")
    .select("domain_slug")
    .eq("observation_id", id);

  return Response.json({
    ...observation,
    domains: domains?.map((d) => d.domain_slug) || [],
  });
}

// PUT /api/admin/observations/[id] — update observation
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createAdminClient();
  const body = await request.json();

  const {
    title,
    slug,
    body: obsBody,
    date_captured,
    status,
    hook_line,
    tension_line,
    art_image_path,
    art_alt,
    seo_title,
    seo_description,
    source,
    domains,
  } = body;

  // Check if transitioning to published for the first time
  let publishedAt: string | undefined;
  if (status === "published") {
    const { data: existing } = await supabase
      .from("observations")
      .select("published_at")
      .eq("id", id)
      .single();
    if (!existing?.published_at) {
      publishedAt = new Date().toISOString();
    }
  }

  const updateData: Record<string, unknown> = {
    title,
    slug,
    body: obsBody,
    date_captured,
    status,
    hook_line: hook_line || null,
    tension_line: tension_line || null,
    art_image_path: art_image_path || null,
    art_alt: art_alt || null,
    seo_title: seo_title || null,
    seo_description: seo_description || null,
    source: source || "original",
  };

  if (publishedAt) {
    updateData.published_at = publishedAt;
  }

  const { data: observation, error } = await supabase
    .from("observations")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  // Save revision snapshot
  const { data: lastRevision } = await supabase
    .from("observation_revisions")
    .select("revision_number")
    .eq("observation_id", id)
    .order("revision_number", { ascending: false })
    .limit(1)
    .single();

  const nextRevisionNumber = (lastRevision?.revision_number || 0) + 1;

  await supabase.from("observation_revisions").insert({
    observation_id: id,
    body: obsBody,
    title,
    revision_number: nextRevisionNumber,
    change_summary: body.change_summary || null,
  });

  // Replace domain mappings
  if (domains !== undefined) {
    await supabase
      .from("observation_domains")
      .delete()
      .eq("observation_id", id);

    if (domains.length > 0) {
      const domainRows = domains.map((d: string) => ({
        observation_id: id,
        domain_slug: d,
      }));
      await supabase.from("observation_domains").insert(domainRows);
    }
  }

  return Response.json(observation);
}

// DELETE /api/admin/observations/[id]
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createAdminClient();

  // Delete domain mappings first
  await supabase
    .from("observation_domains")
    .delete()
    .eq("observation_id", id);

  const { error } = await supabase
    .from("observations")
    .delete()
    .eq("id", id);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}
