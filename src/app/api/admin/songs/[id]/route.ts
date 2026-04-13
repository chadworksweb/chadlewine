import { createAdminClient } from "@/lib/supabase-server";

// Resolve param as UUID or slug
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveSong(supabase: ReturnType<typeof createAdminClient>, idOrSlug: string) {
  const field = UUID_RE.test(idOrSlug) ? "id" : "slug";
  const { data, error } = await supabase.from("songs").select("*").eq(field, idOrSlug).single();
  return { data, error };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createAdminClient();

  const { data: song, error } = await resolveSong(supabase, id);
  if (error) return Response.json({ error: error.message }, { status: 404 });

  const { data: assoc } = await supabase
    .from("album_songs")
    .select("album_id, track_number")
    .eq("song_id", id)
    .single();

  const { data: topicLinks } = await supabase
    .from("song_topics")
    .select("topic_id")
    .eq("song_id", id);

  return Response.json({
    ...song,
    album_id: assoc?.album_id || null,
    track_number: assoc?.track_number || null,
    topic_ids: (topicLinks || []).map((t) => t.topic_id),
  });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: idOrSlug } = await params;
  const supabase = createAdminClient();
  const body = await request.json();

  // Resolve to actual UUID
  const { data: resolved } = await resolveSong(supabase, idOrSlug);
  if (!resolved) return Response.json({ error: "Song not found" }, { status: 404 });
  const id = resolved.id;

  const songFields = ["title", "slug", "duration_seconds", "streaming_path", "download_path", "lyrics", "price", "is_single", "status", "release_date", "song_summary", "isrc", "playback_mode", "focus_keyphrase", "secondary_keyphrases", "search_intent", "citation_summary", "paa_pairs", "entity_tags", "seo_title", "seo_description", "art_image_path", "art_alt"];
  const updates: Record<string, unknown> = {};
  for (const f of songFields) { if (f in body) updates[f] = body[f]; }

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase.from("songs").update(updates).eq("id", id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }

  // Junction updates
  if ("album_id" in body || "track_number" in body) {
    const { data: existing } = await supabase
      .from("album_songs")
      .select("id, album_id, track_number")
      .eq("song_id", id)
      .single();

    const albumId = body.album_id ?? existing?.album_id;
    const trackNumber = body.track_number ?? existing?.track_number ?? 1;

    if (albumId) {
      if (existing) {
        await supabase.from("album_songs").update({ album_id: albumId, track_number: trackNumber }).eq("id", existing.id);
      } else {
        await supabase.from("album_songs").insert({ album_id: albumId, song_id: id, track_number: trackNumber });
      }
    }
  }

  // Replace topic mappings
  if (Array.isArray(body.topic_ids)) {
    await supabase.from("song_topics").delete().eq("song_id", id);
    if (body.topic_ids.length > 0) {
      const rows = body.topic_ids.map((tId: string) => ({ song_id: id, topic_id: tId }));
      await supabase.from("song_topics").insert(rows);
    }
  }

  const { data: song } = await supabase.from("songs").select("*").eq("id", id).single();
  const { data: assoc } = await supabase.from("album_songs").select("album_id, track_number").eq("song_id", id).single();
  const { data: topicLinks } = await supabase.from("song_topics").select("topic_id").eq("song_id", id);

  return Response.json({
    ...song,
    album_id: assoc?.album_id || null,
    track_number: assoc?.track_number || null,
    topic_ids: (topicLinks || []).map((t) => t.topic_id),
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: idOrSlug } = await params;
  const supabase = createAdminClient();
  const { data: resolved } = await resolveSong(supabase, idOrSlug);
  if (!resolved) return Response.json({ error: "Song not found" }, { status: 404 });
  const { error } = await supabase.from("songs").delete().eq("id", resolved.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
