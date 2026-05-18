import { createAdminClient } from "@/lib/supabase-server";
import { captureSlugChange } from "@/lib/redirects";
import { getSingleSongIds } from "@/lib/song-singles";

// Resolve param as UUID or slug
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveSong(supabase: ReturnType<typeof createAdminClient>, idOrSlug: string) {
  const field = UUID_RE.test(idOrSlug) ? "id" : "slug";
  const { data, error } = await supabase.from("songs").select("*").eq(field, idOrSlug).single();
  return { data, error };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: idOrSlug } = await params;
  const supabase = createAdminClient();

  const { data: song, error } = await resolveSong(supabase, idOrSlug);
  if (error || !song) return Response.json({ error: error?.message || "not found" }, { status: 404 });
  const songId = song.id as string;

  // A song may now appear in two release_songs rows: its album AND its
  // single-type release. The Song Editor cares about the album link, so
  // prefer the non-single junction.
  const { data: assocRows } = await supabase
    .from("release_songs")
    .select("release_id, track_number, release:releases(release_type)")
    .eq("song_id", songId);
  const assoc = (assocRows || []).find((row: any) => {
    const rel = Array.isArray(row.release) ? row.release[0] : row.release;
    return rel?.release_type !== "single";
  }) || null;

  const { data: topicLinks } = await supabase
    .from("song_topics")
    .select("topic_id")
    .eq("song_id", songId);

  const singleIds = await getSingleSongIds(supabase);

  return Response.json({
    ...song,
    release_id: assoc?.release_id || null,
    track_number: assoc?.track_number || null,
    topic_ids: (topicLinks || []).map((t) => t.topic_id),
    is_single: singleIds.has(songId),
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

  const songFields = ["title", "slug", "duration_seconds", "streaming_path", "download_path", "download_path_mp3", "download_path_flac", "download_path_wav", "ringtone_path_m4r", "ringtone_path_mp3", "ringtone_price", "lyrics", "instrumental", "price", "status", "release_date", "song_summary", "isrc", "playback_mode", "focus_keyphrase", "secondary_keyphrases", "search_intent", "citation_summary", "paa_pairs", "entity_tags", "seo_title", "seo_description", "art_image_path", "art_alt", "hero_focal_x", "hero_focal_y", "hero_zoom", "card_focal_x", "card_focal_y", "card_zoom", "portrait_focal_x", "portrait_focal_y", "portrait_zoom", "chorus", "chad_quote", "hook_line", "merch_lines", "merch_enabled"];
  const updates: Record<string, unknown> = {};
  for (const f of songFields) { if (f in body) updates[f] = body[f]; }

  const prevSlug = resolved.slug as string | null;

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase.from("songs").update(updates).eq("id", id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }

  if (typeof updates.slug === "string" && prevSlug && prevSlug !== updates.slug) {
    const newSlug = updates.slug;
    await captureSlugChange(`/music/songs/${prevSlug}`, `/music/songs/${newSlug}`, "song", id);

    // Mirror on lyrics URL (/lyrics/{albumSlug}/{songSlug}). Use the
    // album-type junction since the single-type release is the song itself.
    const { data: albumLinkRows } = await supabase
      .from("release_songs")
      .select("release:releases(slug, release_type)")
      .eq("song_id", id);
    const albumLink = (albumLinkRows || [])
      .map((row: any) => (Array.isArray(row.release) ? row.release[0] : row.release))
      .find((rel: { slug?: string; release_type?: string } | null) => rel && rel.release_type !== "single");
    const albumSlug = (albumLink as { slug?: string } | undefined)?.slug;
    if (albumSlug) {
      await captureSlugChange(
        `/lyrics/${albumSlug}/${prevSlug}`,
        `/lyrics/${albumSlug}/${newSlug}`,
        "lyrics",
        id
      );
    }
  }

  // Junction updates. The song may now have a single-type release row too;
  // operate only on the album-type junction to avoid clobbering the single.
  if ("release_id" in body || "track_number" in body) {
    const { data: existingRows } = await supabase
      .from("release_songs")
      .select("id, release_id, track_number, release:releases(release_type)")
      .eq("song_id", id);
    const existing = (existingRows || []).find((row: any) => {
      const rel = Array.isArray(row.release) ? row.release[0] : row.release;
      return rel?.release_type !== "single";
    }) || null;

    const albumId = body.release_id ?? existing?.release_id;
    const trackNumber = body.track_number ?? existing?.track_number ?? 1;

    if (albumId) {
      const result = existing
        ? await supabase
            .from("release_songs")
            .update({ release_id: albumId, track_number: trackNumber })
            .eq("id", existing.id)
        : await supabase
            .from("release_songs")
            .insert({ release_id: albumId, song_id: id, track_number: trackNumber });
      if (result.error) {
        return Response.json(
          { error: `album/track save failed: ${result.error.message}` },
          { status: 400 },
        );
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
  const { data: assocRows } = await supabase
    .from("release_songs")
    .select("release_id, track_number, release:releases(release_type)")
    .eq("song_id", id);
  const assoc = (assocRows || []).find((row: any) => {
    const rel = Array.isArray(row.release) ? row.release[0] : row.release;
    return rel?.release_type !== "single";
  }) || null;
  const { data: topicLinks } = await supabase.from("song_topics").select("topic_id").eq("song_id", id);
  const singleIds = await getSingleSongIds(supabase);

  return Response.json({
    ...song,
    release_id: assoc?.release_id || null,
    track_number: assoc?.track_number || null,
    topic_ids: (topicLinks || []).map((t) => t.topic_id),
    is_single: singleIds.has(id as string),
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
