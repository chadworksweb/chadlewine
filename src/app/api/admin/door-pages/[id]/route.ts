import { createAdminClient } from "@/lib/supabase-server";
import { isReservedSlug } from "@/lib/reserved-slugs";
import { captureSlugChange } from "@/lib/redirects";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveDoorPageId(
  supabase: ReturnType<typeof createAdminClient>,
  idOrSlug: string,
): Promise<string | null> {
  if (UUID_RE.test(idOrSlug)) return idOrSlug;
  const { data } = await supabase.from("door_pages").select("id").eq("slug", idOrSlug).maybeSingle();
  return data?.id ?? null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idOrSlug } = await params;
  const supabase = createAdminClient();
  const field = UUID_RE.test(idOrSlug) ? "id" : "slug";
  const { data, error } = await supabase
    .from("door_pages")
    .select("*")
    .eq(field, idOrSlug)
    .single();

  if (error) return Response.json({ error: error.message }, { status: 404 });
  return Response.json(data);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idOrSlug } = await params;
  const supabase = createAdminClient();
  const id = await resolveDoorPageId(supabase, idOrSlug);
  if (!id) return Response.json({ error: "Door page not found" }, { status: 404 });
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

  if (typeof updates.slug === "string" && isReservedSlug(updates.slug)) {
    return Response.json(
      { error: `"${updates.slug}" is a reserved slug — it collides with a top-level route. Pick a different slug.` },
      { status: 400 }
    );
  }

  if (body.status === "published") {
    const { data: existing } = await supabase.from("door_pages").select("published_at").eq("id", id).single();
    if (!existing?.published_at) {
      updates.published_at = new Date().toISOString();
    }
  }

  const { data: prev } = await supabase.from("door_pages").select("slug").eq("id", id).single();

  const { data, error } = await supabase
    .from("door_pages")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  if (typeof updates.slug === "string" && prev?.slug && prev.slug !== updates.slug) {
    await captureSlugChange(`/${prev.slug}`, `/${updates.slug}`, "door_page", id);
  }

  return Response.json(data);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idOrSlug } = await params;
  const supabase = createAdminClient();
  const id = await resolveDoorPageId(supabase, idOrSlug);
  if (!id) return Response.json({ error: "Door page not found" }, { status: 404 });
  const { error } = await supabase.from("door_pages").delete().eq("id", id);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
