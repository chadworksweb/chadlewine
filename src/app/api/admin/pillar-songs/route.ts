import { createAdminClient } from "@/lib/supabase-server";

// Admin API for the Pillar Songs shrine -- a single global, hand-ordered list
// of Chad's own songs. GET returns the list (in order, with notes) plus the
// pool of published songs not yet in it. POST adds, DELETE removes, PUT
// reorders, PATCH edits the per-song note.

interface SongRow {
  id: string;
  title: string;
  slug: string;
  status: string;
  art_image_path: string | null;
}

export async function GET() {
  const supabase = createAdminClient();

  // Tolerate a not-yet-migrated glitch_id column.
  let rows: { song_id: string; position: number; note: string | null; glitch_id: number }[] = [];
  const withGlitch = await supabase
    .from("pillar_songs")
    .select("song_id, position, note, glitch_id")
    .order("position", { ascending: true });
  if (withGlitch.error) {
    const base = await supabase
      .from("pillar_songs")
      .select("song_id, position, note")
      .order("position", { ascending: true });
    if (base.error) return Response.json({ error: base.error.message }, { status: 500 });
    rows = (base.data || []).map((r, i) => ({
      song_id: r.song_id,
      position: r.position,
      note: r.note,
      glitch_id: i + 1,
    }));
  } else {
    rows = (withGlitch.data || []).map((r) => ({
      song_id: r.song_id,
      position: r.position,
      note: r.note,
      glitch_id: (r.glitch_id as number) ?? 1,
    }));
  }

  const memberIds = rows.map((r) => r.song_id);

  const { data: memberSongs } = memberIds.length
    ? await supabase
        .from("songs")
        .select("id, title, slug, status, art_image_path")
        .in("id", memberIds)
    : { data: [] as SongRow[] };

  const byId = new Map((memberSongs || []).map((s) => [s.id, s as SongRow]));
  const in_list = (rows || [])
    .map((r) => {
      const song = byId.get(r.song_id);
      if (!song) return null;
      return {
        ...song,
        position: r.position,
        note: r.note as string | null,
        glitch_id: (r.glitch_id as number) ?? 1,
      };
    })
    .filter(
      (x): x is SongRow & { position: number; note: string | null; glitch_id: number } => x !== null
    );

  const { data: published } = await supabase
    .from("songs")
    .select("id, title, slug, status, art_image_path")
    .eq("status", "published")
    .order("title", { ascending: true });

  const memberSet = new Set(memberIds);
  const available = (published || []).filter((s) => !memberSet.has(s.id));

  return Response.json({ in_list, available });
}

// POST: add a song to the shrine (appended at the end). Body: { song_id }.
export async function POST(request: Request) {
  const supabase = createAdminClient();
  const body = await request.json();
  const songId = body.song_id;
  if (!songId || typeof songId !== "string") {
    return Response.json({ error: "song_id required" }, { status: 400 });
  }

  const { data: maxRow } = await supabase
    .from("pillar_songs")
    .select("position")
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextPosition = (maxRow?.position ?? -1) + 1;

  // Assign the next glitch id so every new pillar gets its own glitch.
  const { data: maxGlitch } = await supabase
    .from("pillar_songs")
    .select("glitch_id")
    .order("glitch_id", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextGlitch = (maxGlitch?.glitch_id ?? 0) + 1;

  const { error } = await supabase
    .from("pillar_songs")
    .insert({ song_id: songId, position: nextPosition, glitch_id: nextGlitch });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

// DELETE: remove a song from the shrine. Query: ?song_id=...
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const songId = searchParams.get("song_id");
  if (!songId) return Response.json({ error: "song_id required" }, { status: 400 });

  const supabase = createAdminClient();
  const { error } = await supabase.from("pillar_songs").delete().eq("song_id", songId);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

// PUT: reorder the shrine. Body: { song_ids: string[] } in the new order.
// Per-row position update preserves each row's note.
export async function PUT(request: Request) {
  const supabase = createAdminClient();
  const body = await request.json();
  const songIds = body.song_ids;
  if (!Array.isArray(songIds)) {
    return Response.json({ error: "song_ids array required" }, { status: 400 });
  }

  for (let i = 0; i < songIds.length; i++) {
    const { error } = await supabase
      .from("pillar_songs")
      .update({ position: i })
      .eq("song_id", songIds[i]);
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true });
}

// PATCH: edit a row. Body: { song_id, note? , glitch_id? }. Only provided
// fields are updated.
export async function PATCH(request: Request) {
  const supabase = createAdminClient();
  const body = await request.json();
  const songId = body.song_id;
  if (!songId || typeof songId !== "string") {
    return Response.json({ error: "song_id required" }, { status: 400 });
  }

  const update: { note?: string | null; glitch_id?: number } = {};
  if ("note" in body) {
    update.note = typeof body.note === "string" ? body.note.trim() || null : null;
  }
  if ("glitch_id" in body) {
    const g = Math.round(Number(body.glitch_id));
    if (!Number.isFinite(g) || g < 1) {
      return Response.json({ error: "glitch_id must be a positive integer" }, { status: 400 });
    }
    update.glitch_id = g;
  }
  if (Object.keys(update).length === 0) {
    return Response.json({ error: "nothing to update" }, { status: 400 });
  }

  const { error } = await supabase.from("pillar_songs").update(update).eq("song_id", songId);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
