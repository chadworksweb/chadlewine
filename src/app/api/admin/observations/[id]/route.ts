import { createAdminClient } from "@/lib/supabase-server";

// GET /api/admin/observations/[id]
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

  const { data: categoryLinks } = await supabase
    .from("observation_categories")
    .select("category_id")
    .eq("observation_id", id);

  const { data: thoughtlineLinks } = await supabase
    .from("observation_thoughtlines")
    .select("thoughtline_id")
    .eq("observation_id", id);

  const { data: tagLinks } = await supabase
    .from("observation_tags")
    .select("tag_id")
    .eq("observation_id", id);

  const { data: thoughtLinks } = await supabase
    .from("observation_thoughts")
    .select("thought_id")
    .eq("observation_id", id);

  return Response.json({
    ...observation,
    categories: categoryLinks?.map((c) => c.category_id) || [],
    thoughtlines: thoughtlineLinks?.map((t) => t.thoughtline_id) || [],
    tags: tagLinks?.map((t) => t.tag_id) || [],
    thoughts: thoughtLinks?.map((t) => t.thought_id) || [],
  });
}

// PUT /api/admin/observations/[id]
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
    categories,
    thoughtlines,
    tags,
    thoughts,
    focus_keyphrase,
    secondary_keyphrases,
    search_intent,
    citation_summary,
    first_sentence_extractable,
    paa_pairs,
    entity_tags,
    article_type,
  } = body;

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
    focus_keyphrase: focus_keyphrase || null,
    secondary_keyphrases: secondary_keyphrases ?? [],
    search_intent: search_intent || "informational",
    citation_summary: citation_summary || null,
    first_sentence_extractable: first_sentence_extractable ?? false,
    paa_pairs: paa_pairs ?? [],
    entity_tags: entity_tags ?? [],
    article_type: article_type || "article",
  };

  const { data: observation, error } = await supabase
    .from("observations")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  // Replace category mappings
  if (categories !== undefined) {
    await supabase
      .from("observation_categories")
      .delete()
      .eq("observation_id", id);

    if (categories.length > 0) {
      const rows = categories.map((cId: string) => ({
        observation_id: id,
        category_id: cId,
      }));
      await supabase.from("observation_categories").insert(rows);
    }
  }

  // Replace thoughtline mappings
  if (thoughtlines !== undefined) {
    await supabase
      .from("observation_thoughtlines")
      .delete()
      .eq("observation_id", id);

    if (thoughtlines.length > 0) {
      const rows = thoughtlines.map((tId: string) => ({
        observation_id: id,
        thoughtline_id: tId,
      }));
      await supabase.from("observation_thoughtlines").insert(rows);
    }
  }

  // Replace tag mappings
  if (tags !== undefined) {
    await supabase
      .from("observation_tags")
      .delete()
      .eq("observation_id", id);

    if (tags.length > 0) {
      const tagRows = tags.map((t: string) => ({
        observation_id: id,
        tag_id: t,
      }));
      await supabase.from("observation_tags").insert(tagRows);
    }
  }

  // Replace thought mappings
  if (thoughts !== undefined) {
    await supabase
      .from("observation_thoughts")
      .delete()
      .eq("observation_id", id);

    if (thoughts.length > 0) {
      const thoughtRows = thoughts.map((t: string) => ({
        observation_id: id,
        thought_id: t,
      }));
      await supabase.from("observation_thoughts").insert(thoughtRows);
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

  const { error } = await supabase
    .from("observations")
    .delete()
    .eq("id", id);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}
