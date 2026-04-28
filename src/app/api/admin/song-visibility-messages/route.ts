import { createAdminClient } from "@/lib/supabase-server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveSongId(
  supabase: ReturnType<typeof createAdminClient>,
  idOrSlug: string,
): Promise<string | null> {
  if (UUID_RE.test(idOrSlug)) return idOrSlug;
  const { data } = await supabase.from("songs").select("id").eq("slug", idOrSlug).maybeSingle();
  return data?.id ?? null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const songIdOrSlug = searchParams.get("song_id");
  if (!songIdOrSlug) return Response.json({ error: "song_id required" }, { status: 400 });

  const supabase = createAdminClient();
  const songId = await resolveSongId(supabase, songIdOrSlug);
  if (!songId) return Response.json([]);

  const { data, error } = await supabase
    .from("song_visibility_messages")
    .select("*")
    .eq("song_id", songId)
    .order("created_at");

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data || []);
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const songIdOrSlug = searchParams.get("song_id");
  if (!songIdOrSlug) return Response.json({ error: "song_id required" }, { status: 400 });

  const supabase = createAdminClient();
  const songId = await resolveSongId(supabase, songIdOrSlug);
  if (!songId) return Response.json({ ok: true });

  const { error } = await supabase
    .from("song_visibility_messages")
    .delete()
    .eq("song_id", songId);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
