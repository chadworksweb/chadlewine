import { createAdminClient } from "@/lib/supabase-server";
import { isCreditRole } from "@/lib/song-credits";

// GET ?song_id= -> ordered credit rows for a song.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const songId = searchParams.get("song_id");
  if (!songId) return Response.json({ error: "song_id required" }, { status: 400 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("song_credits")
    .select("*")
    .eq("song_id", songId)
    .order("display_order")
    .order("created_at");

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

// POST -> create a credit line. Appends to the end of the song's list.
export async function POST(request: Request) {
  const supabase = createAdminClient();
  const body = await request.json();
  if (!body.song_id) return Response.json({ error: "song_id required" }, { status: 400 });
  if (!isCreditRole(body.role)) return Response.json({ error: "invalid role" }, { status: 400 });
  if (!body.name?.trim()) return Response.json({ error: "name required" }, { status: 400 });

  // Next display_order = current max + 1.
  const { data: last } = await supabase
    .from("song_credits")
    .select("display_order")
    .eq("song_id", body.song_id)
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (last?.display_order ?? -1) + 1;

  const { data, error } = await supabase
    .from("song_credits")
    .insert({
      song_id: body.song_id,
      role: body.role,
      name: body.name.trim(),
      display_order: nextOrder,
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data, { status: 201 });
}

// PUT { ids: [...] } -> persist a new order. ids are the credit row ids in the
// desired display order.
export async function PUT(request: Request) {
  const supabase = createAdminClient();
  const body = await request.json();
  const ids: unknown = body.ids;
  if (!Array.isArray(ids)) return Response.json({ error: "ids array required" }, { status: 400 });

  for (let i = 0; i < ids.length; i++) {
    const { error } = await supabase
      .from("song_credits")
      .update({ display_order: i })
      .eq("id", ids[i]);
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true });
}
