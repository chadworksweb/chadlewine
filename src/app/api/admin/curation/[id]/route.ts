import { createAdminClient } from "@/lib/supabase-server";
import { captureSlugChange } from "@/lib/redirects";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveCuratedId(
  supabase: ReturnType<typeof createAdminClient>,
  idOrSlug: string,
): Promise<string | null> {
  if (UUID_RE.test(idOrSlug)) return idOrSlug;
  const { data } = await supabase.from("curated_entries").select("id").eq("slug", idOrSlug).maybeSingle();
  return data?.id ?? null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: idOrSlug } = await params;
  const supabase = createAdminClient();
  const field = UUID_RE.test(idOrSlug) ? "id" : "slug";
  const { data, error } = await supabase.from("curated_entries").select("*").eq(field, idOrSlug).single();
  if (error) return Response.json({ error: error.message }, { status: 404 });
  return Response.json(data);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: idOrSlug } = await params;
  const supabase = createAdminClient();
  const id = await resolveCuratedId(supabase, idOrSlug);
  if (!id) return Response.json({ error: "Curated entry not found" }, { status: 404 });
  const body = await request.json();

  const fields = [
    "type", "title", "slug", "artist_name", "description", "body",
    "cover_image_path", "outbound_url", "outbound_links",
    "rising_compass_score", "rising_compass_classification",
    "genre", "mood_tags", "seo_title", "seo_description", "focus_keyphrase",
    "status", "display_order",
  ];
  const updates: Record<string, unknown> = {};
  for (const f of fields) {
    if (f in body) updates[f] = body[f];
  }

  // Set published_at on first publish
  if (body.status === "published") {
    const { data: existing } = await supabase.from("curated_entries").select("published_at").eq("id", id).single();
    if (!existing?.published_at) {
      updates.published_at = new Date().toISOString();
    }
  }

  const { data: prev } = await supabase.from("curated_entries").select("slug").eq("id", id).single();

  const { data, error } = await supabase.from("curated_entries").update(updates).eq("id", id).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  if (typeof updates.slug === "string" && prev?.slug && prev.slug !== updates.slug) {
    await captureSlugChange(`/curation/${prev.slug}`, `/curation/${updates.slug}`, "curation", id);
  }

  return Response.json(data);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: idOrSlug } = await params;
  const supabase = createAdminClient();
  const id = await resolveCuratedId(supabase, idOrSlug);
  if (!id) return Response.json({ error: "Curated entry not found" }, { status: 404 });
  const { error } = await supabase.from("curated_entries").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
