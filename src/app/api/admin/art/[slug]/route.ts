import { createAdminClient } from "@/lib/supabase-server";
import { captureSlugChange } from "@/lib/redirects";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("art_pieces").select("*").eq("slug", slug).single();
  if (error) return Response.json({ error: error.message }, { status: 404 });
  return Response.json(data);
}

export async function PUT(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = createAdminClient();
  const body = await request.json();
  const fields = [
    "title", "slug", "medium", "image_path", "image_alt", "description",
    "display_order", "status", "dimensions", "year_created", "gallery_paths",
    "in_situ_paths",
    "art_summary", "chad_quote", "format_id",
    "hero_focal_x", "hero_focal_y", "hero_zoom",
    "card_focal_x", "card_focal_y", "card_zoom",
    "portrait_focal_x", "portrait_focal_y", "portrait_zoom",
    "focus_keyphrase", "secondary_keyphrases", "search_intent", "citation_summary",
    "paa_pairs", "entity_tags", "seo_title", "seo_description",
    "licensing_direct_answer", "licensing_content", "licensing_key_points",
  ];
  const updates: Record<string, unknown> = {};
  for (const f of fields) { if (f in body) updates[f] = body[f]; }
  const { data, error } = await supabase.from("art_pieces").update(updates).eq("slug", slug).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  if (typeof updates.slug === "string" && updates.slug !== slug) {
    await captureSlugChange(`/art/${slug}`, `/art/${updates.slug}`, "art", data?.id ?? null);
  }

  return Response.json(data);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = createAdminClient();
  const { error } = await supabase.from("art_pieces").delete().eq("slug", slug);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
