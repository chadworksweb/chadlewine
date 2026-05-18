import { createAdminClient } from "@/lib/supabase-server";
import { captureSlugChange } from "@/lib/redirects";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveAlbumId(
  supabase: ReturnType<typeof createAdminClient>,
  idOrSlug: string,
): Promise<string | null> {
  if (UUID_RE.test(idOrSlug)) return idOrSlug;
  const { data } = await supabase.from("releases").select("id").eq("slug", idOrSlug).maybeSingle();
  return data?.id ?? null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: idOrSlug } = await params;
  const supabase = createAdminClient();
  const field = UUID_RE.test(idOrSlug) ? "id" : "slug";
  const { data, error } = await supabase.from("releases").select("*").eq(field, idOrSlug).single();
  if (error) return Response.json({ error: error.message }, { status: 404 });
  return Response.json(data);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: idOrSlug } = await params;
  const supabase = createAdminClient();
  const id = await resolveAlbumId(supabase, idOrSlug);
  if (!id) return Response.json({ error: "Album not found" }, { status: 404 });
  const body = await request.json();
  const fields = [
    "title", "slug", "release_date",
    "cover_art_path", "cover_art_alt",
    "concept_statement",
    "citation_summary", "entity_tags",
    "display_order", "status", "release_type",
    "hero_focal_x", "hero_focal_y", "hero_zoom",
    "card_focal_x", "card_focal_y", "card_zoom",
    "portrait_focal_x", "portrait_focal_y", "portrait_zoom",
  ];
  const updates: Record<string, unknown> = {};
  for (const f of fields) { if (f in body) updates[f] = body[f]; }

  const { data: prev } = await supabase.from("releases").select("slug").eq("id", id).single();

  const { data, error } = await supabase.from("releases").update(updates).eq("id", id).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  if (typeof updates.slug === "string" && prev?.slug && prev.slug !== updates.slug) {
    const oldSlug = prev.slug as string;
    const newSlug = updates.slug;
    await captureSlugChange(`/music/releases/${oldSlug}`, `/music/releases/${newSlug}`, "release", id);

    // Mirror lyrics URLs for every track on the album
    const { data: tracks } = await supabase
      .from("release_songs")
      .select("song:songs(slug)")
      .eq("release_id", id);
    for (const t of (tracks || []) as Array<{ song?: { slug?: string } }>) {
      const songSlug = t.song?.slug;
      if (songSlug) {
        await captureSlugChange(
          `/lyrics/${oldSlug}/${songSlug}`,
          `/lyrics/${newSlug}/${songSlug}`,
          "lyrics",
          id
        );
      }
    }
  }

  return Response.json(data);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: idOrSlug } = await params;
  const supabase = createAdminClient();
  const id = await resolveAlbumId(supabase, idOrSlug);
  if (!id) return Response.json({ error: "Album not found" }, { status: 404 });
  const { error } = await supabase.from("releases").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
