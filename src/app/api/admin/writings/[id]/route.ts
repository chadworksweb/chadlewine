import { createAdminClient } from "@/lib/supabase-server";
import { captureSlugChange } from "@/lib/redirects";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolvePostId(
  supabase: ReturnType<typeof createAdminClient>,
  idOrSlug: string,
): Promise<string | null> {
  if (UUID_RE.test(idOrSlug)) return idOrSlug;
  const { data } = await supabase.from("posts").select("id").eq("slug", idOrSlug).maybeSingle();
  return data?.id ?? null;
}

// GET /api/admin/writings/[id]
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idOrSlug } = await params;
  const supabase = createAdminClient();
  const field = UUID_RE.test(idOrSlug) ? "id" : "slug";

  const { data: observation, error } = await supabase
    .from("posts")
    .select("*")
    .eq(field, idOrSlug)
    .single();

  if (error || !observation) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const id = observation.id as string;

  const { data: categoryLinks } = await supabase
    .from("post_categories")
    .select("category_id")
    .eq("post_id", id);

  const { data: thoughtlineLinks } = await supabase
    .from("post_thoughtlines")
    .select("thoughtline_id")
    .eq("post_id", id);

  const { data: tagLinks } = await supabase
    .from("post_tags")
    .select("tag_id")
    .eq("post_id", id);

  return Response.json({
    ...observation,
    categories: categoryLinks?.map((c) => c.category_id) || [],
    thoughtlines: thoughtlineLinks?.map((t) => t.thoughtline_id) || [],
    tags: tagLinks?.map((t) => t.tag_id) || [],
  });
}

// PUT /api/admin/writings/[id]
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idOrSlug } = await params;
  const supabase = createAdminClient();
  const id = await resolvePostId(supabase, idOrSlug);
  if (!id) return Response.json({ error: "Post not found" }, { status: 404 });
  const body = await request.json();

  const {
    title,
    slug,
    body: obsBody,
    date_captured,
    status,
    kind,
    hook_line,
    tension_line,
    art_image_path,
    art_alt,
    seo_title,
    seo_description,
    categories,
    thoughtlines,
    tags,
    focus_keyphrase,
    secondary_keyphrases,
    search_intent,
    citation_summary,
    first_sentence_extractable,
    paa_pairs,
    entity_tags,
    article_type,
    related_music,
    art_fullres_print_path,
    art_fullres_wallpaper_path,
    hero_focal_x,
    hero_focal_y,
    hero_zoom,
    card_focal_x,
    card_focal_y,
    card_zoom,
    portrait_focal_x,
    portrait_focal_y,
    portrait_zoom,
  } = body;

  const updateData: Record<string, unknown> = {
    title,
    slug,
    body: obsBody,
    date_captured,
    status,
    ...(kind === "observation" || kind === "journal" ? { kind } : {}),
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
    related_music: related_music ?? [],
    art_fullres_print_path: art_fullres_print_path || null,
    art_fullres_wallpaper_path: art_fullres_wallpaper_path || null,
    hero_focal_x: hero_focal_x ?? null,
    hero_focal_y: hero_focal_y ?? null,
    hero_zoom: hero_zoom ?? 1,
    card_focal_x: card_focal_x ?? null,
    card_focal_y: card_focal_y ?? null,
    card_zoom: card_zoom ?? 1,
    portrait_focal_x: portrait_focal_x ?? null,
    portrait_focal_y: portrait_focal_y ?? null,
    portrait_zoom: portrait_zoom ?? 1,
  };

  const { data: prev } = await supabase
    .from("posts")
    .select("slug, kind")
    .eq("id", id)
    .single();

  const { data: observation, error } = await supabase
    .from("posts")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  if (prev?.slug && slug && prev.slug !== slug) {
    // observation + journal posts share this table; redirect under the right section.
    const effectiveKind = kind === "observation" || kind === "journal" ? kind : prev.kind;
    const section = effectiveKind === "journal" ? "writings/journal" : "writings/observations";
    await captureSlugChange(
      `/${section}/${prev.slug}`,
      `/${section}/${slug}`,
      "observation",
      id
    );
  }

  // Replace category mappings
  if (categories !== undefined) {
    await supabase
      .from("post_categories")
      .delete()
      .eq("post_id", id);

    if (categories.length > 0) {
      const rows = categories.map((cId: string) => ({
        post_id: id,
        category_id: cId,
      }));
      await supabase.from("post_categories").insert(rows);
    }
  }

  // Replace thoughtline mappings
  if (thoughtlines !== undefined) {
    await supabase
      .from("post_thoughtlines")
      .delete()
      .eq("post_id", id);

    if (thoughtlines.length > 0) {
      const rows = thoughtlines.map((tId: string) => ({
        post_id: id,
        thoughtline_id: tId,
      }));
      await supabase.from("post_thoughtlines").insert(rows);
    }
  }

  // Replace tag mappings
  if (tags !== undefined) {
    await supabase
      .from("post_tags")
      .delete()
      .eq("post_id", id);

    if (tags.length > 0) {
      const tagRows = tags.map((t: string) => ({
        post_id: id,
        tag_id: t,
      }));
      await supabase.from("post_tags").insert(tagRows);
    }
  }

  return Response.json(observation);
}

// DELETE /api/admin/writings/[id]
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idOrSlug } = await params;
  const supabase = createAdminClient();
  const id = await resolvePostId(supabase, idOrSlug);
  if (!id) return Response.json({ error: "Post not found" }, { status: 404 });

  const { error } = await supabase
    .from("posts")
    .delete()
    .eq("id", id);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}
