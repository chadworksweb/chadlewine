import { createAdminClient } from "@/lib/supabase-server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface IfYouLikeEntry {
  artist: string;
  title: string;
  reason: string;
}

async function resolveSongId(
  supabase: ReturnType<typeof createAdminClient>,
  idOrSlug: string,
): Promise<string | null> {
  if (UUID_RE.test(idOrSlug)) return idOrSlug;
  const { data } = await supabase.from("songs").select("id").eq("slug", idOrSlug).maybeSingle();
  return data?.id ?? null;
}

function sanitizeEntries(input: unknown): IfYouLikeEntry[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((raw) => {
      if (!raw || typeof raw !== "object") return null;
      const r = raw as Record<string, unknown>;
      const artist = typeof r.artist === "string" ? r.artist.trim() : "";
      const title = typeof r.title === "string" ? r.title.trim() : "";
      const reason = typeof r.reason === "string" ? r.reason.trim() : "";
      if (!artist && !title && !reason) return null;
      return { artist, title, reason };
    })
    .filter((e): e is IfYouLikeEntry => e !== null);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const songIdOrSlug = searchParams.get("song_id");
  if (!songIdOrSlug) return Response.json({ error: "song_id required" }, { status: 400 });

  const supabase = createAdminClient();
  const songId = await resolveSongId(supabase, songIdOrSlug);
  if (!songId) return Response.json({ error: "Song not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("songs")
    .select("if_you_like_blurb, if_you_like_entries")
    .eq("id", songId)
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({
    blurb: data?.if_you_like_blurb ?? null,
    entries: sanitizeEntries(data?.if_you_like_entries),
  });
}

export async function PUT(request: Request) {
  const body = await request.json();
  if (!body.song_id) return Response.json({ error: "song_id required" }, { status: 400 });

  const supabase = createAdminClient();
  const songId = await resolveSongId(supabase, body.song_id);
  if (!songId) return Response.json({ error: "Song not found" }, { status: 404 });

  const blurb = typeof body.blurb === "string" ? body.blurb.trim() || null : null;
  const entries = sanitizeEntries(body.entries);

  const { error } = await supabase
    .from("songs")
    .update({ if_you_like_blurb: blurb, if_you_like_entries: entries })
    .eq("id", songId);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, blurb, entries });
}
