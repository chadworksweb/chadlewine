import { createAdminClient } from "@/lib/supabase-server";
import { ALBUM_VISIBILITY_CATEGORIES } from "@/lib/album-visibility";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/admin/album-visibility-sections/bootstrap
 *   body: { album_id: uuid | slug }
 *
 * Ensures one row exists per category for the album. Idempotent — uses upsert
 * with onConflict on (album_id, category). Existing rows are untouched.
 *
 * The admin UI calls this on first load so every category has an editable row
 * even before any content has been entered. Concept gets seeded from
 * albums.concept_statement if present and the row is being created fresh.
 */
export async function POST(request: Request) {
  const body = await request.json();
  const albumIdOrSlug: string | undefined = body.album_id;
  if (!albumIdOrSlug) return Response.json({ error: "album_id required" }, { status: 400 });

  const supabase = createAdminClient();

  let albumId: string | null = albumIdOrSlug;
  if (!UUID_RE.test(albumIdOrSlug)) {
    const { data } = await supabase
      .from("albums")
      .select("id")
      .eq("slug", albumIdOrSlug)
      .maybeSingle();
    albumId = data?.id ?? null;
  }
  if (!albumId) return Response.json({ error: "Album not found" }, { status: 404 });

  const { data: existing } = await supabase
    .from("album_visibility_sections")
    .select("category")
    .eq("album_id", albumId);

  const have = new Set((existing || []).map((r: { category: string }) => r.category));

  const toInsert = ALBUM_VISIBILITY_CATEGORIES.filter((c) => !have.has(c.slug)).map(
    (c, i) => ({
      album_id: albumId!,
      category: c.slug,
      content: "",
      direct_answer: null,
      key_points: [],
      data_payload: {},
      status: c.default_status || "draft",
      display_order: i,
    }),
  );

  if (toInsert.length > 0) {
    const { error } = await supabase
      .from("album_visibility_sections")
      .insert(toInsert);
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }

  const { data: rows } = await supabase
    .from("album_visibility_sections")
    .select("*")
    .eq("album_id", albumId)
    .order("display_order")
    .order("created_at");

  return Response.json({ ok: true, created: toInsert.length, sections: rows || [] });
}
