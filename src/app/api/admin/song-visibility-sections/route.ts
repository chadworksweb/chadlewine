import { createAdminClient } from "@/lib/supabase-server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const songId = searchParams.get("song_id");
  const supabase = createAdminClient();

  let query = supabase.from("song_visibility_sections").select("*");
  if (songId) query = query.eq("song_id", songId);
  query = query.order("display_order").order("created_at");

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function POST(request: Request) {
  const supabase = createAdminClient();
  const body = await request.json();
  if (!body.song_id) return Response.json({ error: "song_id required" }, { status: 400 });
  if (!body.category) return Response.json({ error: "category required" }, { status: 400 });

  const { data, error } = await supabase.from("song_visibility_sections").insert({
    song_id: body.song_id,
    category: body.category,
    content: body.content || "",
    status: body.status || "draft",
    display_order: body.display_order ?? 0,
  }).select().single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data, { status: 201 });
}
