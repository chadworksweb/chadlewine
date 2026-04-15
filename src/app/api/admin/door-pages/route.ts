import { createAdminClient } from "@/lib/supabase-server";
import { slugify } from "@/lib/utils";
import { isReservedSlug } from "@/lib/reserved-slugs";

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("door_pages")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function POST(request: Request) {
  const supabase = createAdminClient();
  const body = await request.json();
  const {
    title, slug, body: pageBody, meta_title, meta_description,
    target_queries, funnel_targets, og_image_path, og_alt, status,
    seo_title, seo_description, focus_keyphrase, secondary_keyphrases,
    search_intent, citation_summary, first_sentence_extractable,
    paa_pairs, entity_tags, article_type, hook_line, tension_line,
  } = body;

  if (!title) {
    return Response.json({ error: "title is required" }, { status: 400 });
  }

  const finalSlug = slug?.trim() || slugify(title);

  if (isReservedSlug(finalSlug)) {
    return Response.json(
      { error: `"${finalSlug}" is a reserved slug — it collides with a top-level route. Pick a different slug.` },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("door_pages")
    .insert({
      title: title.trim(),
      slug: finalSlug,
      body: pageBody || "",
      meta_title: meta_title || null,
      meta_description: meta_description || null,
      target_queries: target_queries || [],
      funnel_targets: funnel_targets || [],
      og_image_path: og_image_path || null,
      og_alt: og_alt || null,
      status: status || "draft",
      published_at: status === "published" ? new Date().toISOString() : null,
      seo_title: seo_title || null,
      seo_description: seo_description || null,
      focus_keyphrase: focus_keyphrase || null,
      secondary_keyphrases: secondary_keyphrases || [],
      search_intent: search_intent || "informational",
      citation_summary: citation_summary || null,
      first_sentence_extractable: first_sentence_extractable || false,
      paa_pairs: paa_pairs || [],
      entity_tags: entity_tags || [],
      article_type: article_type || "article",
      hook_line: hook_line || null,
      tension_line: tension_line || null,
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data, { status: 201 });
}
