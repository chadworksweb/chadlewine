import { createAdminClient } from "@/lib/supabase-server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveAlbumId(
  supabase: ReturnType<typeof createAdminClient>,
  idOrSlug: string,
): Promise<string | null> {
  if (UUID_RE.test(idOrSlug)) return idOrSlug;
  const { data } = await supabase.from("releases").select("id").eq("slug", idOrSlug).maybeSingle();
  return data?.id ?? null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const albumIdOrSlug = searchParams.get("release_id");
  if (!albumIdOrSlug) return Response.json({ error: "album_id required" }, { status: 400 });

  const supabase = createAdminClient();
  const albumId = await resolveAlbumId(supabase, albumIdOrSlug);
  if (!albumId) return Response.json([]);

  const { data, error } = await supabase
    .from("release_visibility_messages")
    .select("*")
    .eq("release_id", albumId)
    .order("created_at");

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data || []);
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const albumIdOrSlug = searchParams.get("release_id");
  if (!albumIdOrSlug) return Response.json({ error: "album_id required" }, { status: 400 });

  const supabase = createAdminClient();
  const albumId = await resolveAlbumId(supabase, albumIdOrSlug);
  if (!albumId) return Response.json({ ok: true });

  const { error } = await supabase
    .from("release_visibility_messages")
    .delete()
    .eq("release_id", albumId);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
