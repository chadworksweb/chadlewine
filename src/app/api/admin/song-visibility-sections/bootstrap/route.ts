import { createAdminClient } from "@/lib/supabase-server";
import { VISIBILITY_CATEGORIES } from "@/lib/song-visibility";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/admin/song-visibility-sections/bootstrap
 *   body: { song_id: uuid | slug }
 *
 * Ensures a row exists for each "data" category (e.g. merch) so the admin UI
 * can curate picks even before anything has been entered. Narrative categories
 * are intentionally NOT seeded here -- they keep their existing "empty until
 * generated" behavior. Idempotent: existing rows are left untouched.
 */
export async function POST(request: Request) {
  const body = await request.json();
  const songIdOrSlug: string | undefined = body.song_id;
  if (!songIdOrSlug) return Response.json({ error: "song_id required" }, { status: 400 });

  const supabase = createAdminClient();

  let songId: string | null = songIdOrSlug;
  if (!UUID_RE.test(songIdOrSlug)) {
    const { data } = await supabase
      .from("songs")
      .select("id")
      .eq("slug", songIdOrSlug)
      .maybeSingle();
    songId = data?.id ?? null;
  }
  if (!songId) return Response.json({ error: "Song not found" }, { status: 404 });

  const { data: existing } = await supabase
    .from("song_visibility_sections")
    .select("category")
    .eq("song_id", songId);

  const have = new Set((existing || []).map((r: { category: string }) => r.category));

  // Data sections default to 'published' -- their content is just curation.
  const toInsert = VISIBILITY_CATEGORIES
    .filter((c) => c.kind === "data" && !have.has(c.slug))
    .map((c) => ({
      song_id: songId!,
      category: c.slug,
      content: "",
      direct_answer: null,
      key_points: [],
      data_payload: {},
      status: "published",
      display_order: 50,
    }));

  if (toInsert.length > 0) {
    const { error } = await supabase
      .from("song_visibility_sections")
      .insert(toInsert);
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }

  const { data: rows } = await supabase
    .from("song_visibility_sections")
    .select("*")
    .eq("song_id", songId)
    .order("display_order")
    .order("created_at");

  return Response.json({ ok: true, created: toInsert.length, sections: rows || [] });
}
