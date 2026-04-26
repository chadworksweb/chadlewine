import { createAdminClient } from "@/lib/supabase-server";
import { slugify } from "@/lib/utils";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const albumId = searchParams.get("album_id");
  const supabase = createAdminClient();

  if (albumId) {
    // Get songs for a specific album via junction
    const { data, error } = await supabase
      .from("album_songs")
      .select("track_number, song:songs(*)")
      .eq("album_id", albumId)
      .order("track_number");
    if (error) return Response.json({ error: error.message }, { status: 500 });
    const flat = (data || []).map((row: any) => ({ ...row.song, track_number: row.track_number }));
    return Response.json(flat);
  }

  const { data, error } = await supabase.from("songs").select("*").order("title");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function POST(request: Request) {
  const supabase = createAdminClient();
  const body = await request.json();
  if (!body.title) return Response.json({ error: "title required" }, { status: 400 });

  const { data: song, error } = await supabase.from("songs").insert({
    title: body.title.trim(),
    slug: body.slug?.trim() || slugify(body.title),
    duration_seconds: body.duration_seconds || null,
    streaming_path: body.streaming_path || null,
    download_path: body.download_path || null,
    lyrics: body.lyrics || null,
    instrumental: body.instrumental === true,
    price: body.price || null,
    is_single: body.is_single || false,
    status: body.status || "draft",
    release_date: body.release_date || null,
    song_summary: body.song_summary || null,
    isrc: body.isrc || null,
    playback_mode: body.playback_mode || null,
    focus_keyphrase: body.focus_keyphrase || null,
    secondary_keyphrases: body.secondary_keyphrases || [],
    search_intent: body.search_intent || "informational",
    citation_summary: body.citation_summary || null,
    paa_pairs: body.paa_pairs || [],
    entity_tags: body.entity_tags || [],
    seo_title: body.seo_title || null,
    seo_description: body.seo_description || null,
    art_image_path: body.art_image_path || null,
    art_alt: body.art_alt || null,
    hero_focal_x: body.hero_focal_x ?? null,
    hero_focal_y: body.hero_focal_y ?? null,
    hero_zoom: typeof body.hero_zoom === "number" ? body.hero_zoom : 1.0,
    card_focal_x: body.card_focal_x ?? null,
    card_focal_y: body.card_focal_y ?? null,
    card_zoom: typeof body.card_zoom === "number" ? body.card_zoom : 1.0,
    portrait_focal_x: body.portrait_focal_x ?? null,
    portrait_focal_y: body.portrait_focal_y ?? null,
    portrait_zoom: typeof body.portrait_zoom === "number" ? body.portrait_zoom : 1.0,
    chorus: body.chorus || null,
    chad_quote: body.chad_quote || null,
    hook_line: body.hook_line || null,
    merch_lines: body.merch_lines || [],
    merch_enabled: body.merch_enabled === true,
  }).select().single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Create junction row if album provided
  if (body.album_id && song) {
    const { error: jErr } = await supabase.from("album_songs").insert({
      album_id: body.album_id,
      song_id: song.id,
      track_number: body.track_number || 1,
    });
    if (jErr) return Response.json({ error: jErr.message }, { status: 500 });
  }

  // Create topic mappings
  if (Array.isArray(body.topic_ids) && body.topic_ids.length > 0 && song) {
    const rows = body.topic_ids.map((tId: string) => ({ song_id: song.id, topic_id: tId }));
    await supabase.from("song_topics").insert(rows);
  }

  return Response.json({
    ...song,
    album_id: body.album_id,
    track_number: body.track_number || 1,
    topic_ids: Array.isArray(body.topic_ids) ? body.topic_ids : [],
  }, { status: 201 });
}
