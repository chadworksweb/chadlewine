import { createAdminClient } from "@/lib/supabase-server";
import { slugify } from "@/lib/utils";

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("art_pieces").select("*").order("display_order");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function POST(request: Request) {
  const supabase = createAdminClient();
  const body = await request.json();
  if (!body.title || !body.image_path) return Response.json({ error: "title and image_path required" }, { status: 400 });

  const { data, error } = await supabase.from("art_pieces").insert({
    title: body.title.trim(),
    slug: body.slug?.trim() || slugify(body.title),
    medium: body.medium || null,
    image_path: body.image_path,
    image_alt: body.image_alt || null,
    description: body.description || null,
    display_order: body.display_order || 0,
    status: body.status || "draft",
    year_created: body.year_created ?? null,
    gallery_paths: Array.isArray(body.gallery_paths) ? body.gallery_paths : [],
    art_summary: body.art_summary || null,
    chad_quote: body.chad_quote || null,
    hero_focal_x: body.hero_focal_x ?? null,
    hero_focal_y: body.hero_focal_y ?? null,
    hero_zoom: typeof body.hero_zoom === "number" ? body.hero_zoom : 1.0,
    card_focal_x: body.card_focal_x ?? null,
    card_focal_y: body.card_focal_y ?? null,
    card_zoom: typeof body.card_zoom === "number" ? body.card_zoom : 1.0,
    portrait_focal_x: body.portrait_focal_x ?? null,
    portrait_focal_y: body.portrait_focal_y ?? null,
    portrait_zoom: typeof body.portrait_zoom === "number" ? body.portrait_zoom : 1.0,
    focus_keyphrase: body.focus_keyphrase || null,
    secondary_keyphrases: Array.isArray(body.secondary_keyphrases) ? body.secondary_keyphrases : [],
    search_intent: body.search_intent || "informational",
    citation_summary: body.citation_summary || null,
    paa_pairs: Array.isArray(body.paa_pairs) ? body.paa_pairs : [],
    entity_tags: Array.isArray(body.entity_tags) ? body.entity_tags : [],
    seo_title: body.seo_title || null,
    seo_description: body.seo_description || null,
  }).select().single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data, { status: 201 });
}
