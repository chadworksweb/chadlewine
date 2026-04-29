import { createAdminClient } from "@/lib/supabase-server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveAlbumId(
  supabase: ReturnType<typeof createAdminClient>,
  idOrSlug: string,
): Promise<string | null> {
  if (UUID_RE.test(idOrSlug)) return idOrSlug;
  const { data } = await supabase.from("albums").select("id").eq("slug", idOrSlug).maybeSingle();
  return data?.id ?? null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const albumIdOrSlug = searchParams.get("album_id");
  const supabase = createAdminClient();

  let query = supabase.from("album_visibility_sections").select("*");
  if (albumIdOrSlug) {
    const albumId = await resolveAlbumId(supabase, albumIdOrSlug);
    if (!albumId) return Response.json([]);
    query = query.eq("album_id", albumId);
  }
  query = query.order("display_order").order("created_at");

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data || []);
}

export async function POST(request: Request) {
  const supabase = createAdminClient();
  const body = await request.json();
  if (!body.album_id) return Response.json({ error: "album_id required" }, { status: 400 });
  if (!body.category) return Response.json({ error: "category required" }, { status: 400 });

  const { data, error } = await supabase.from("album_visibility_sections").insert({
    album_id: body.album_id,
    category: body.category,
    content: body.content || "",
    direct_answer: body.direct_answer || null,
    key_points: body.key_points || [],
    data_payload: body.data_payload || {},
    status: body.status || "draft",
    display_order: body.display_order ?? 0,
  }).select().single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data, { status: 201 });
}
