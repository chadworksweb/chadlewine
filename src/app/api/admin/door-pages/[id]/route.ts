import { createAdminClient } from "@/lib/supabase-server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("door_pages")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return Response.json({ error: error.message }, { status: 404 });
  return Response.json(data);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createAdminClient();
  const body = await request.json();

  const updates: Record<string, unknown> = {};
  const fields = [
    "title", "slug", "body", "meta_title", "meta_description",
    "target_queries", "funnel_targets", "og_image_path", "og_alt", "status",
    "seo_title", "seo_description", "focus_keyphrase", "secondary_keyphrases",
    "search_intent", "citation_summary", "first_sentence_extractable",
    "paa_pairs", "entity_tags", "article_type", "hook_line", "tension_line",
  ];
  for (const f of fields) {
    if (f in body) updates[f] = body[f];
  }

  if (body.status === "published") {
    const { data: existing } = await supabase.from("door_pages").select("published_at").eq("id", id).single();
    if (!existing?.published_at) {
      updates.published_at = new Date().toISOString();
    }
  }

  const { data, error } = await supabase
    .from("door_pages")
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
  const { id } = await params;
  const supabase = createAdminClient();
  const { error } = await supabase.from("door_pages").delete().eq("id", id);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
