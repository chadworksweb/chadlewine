import { createAdminClient } from "@/lib/supabase-server";
import { slugify } from "@/lib/utils";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const songId = searchParams.get("song_id");
  const supabase = createAdminClient();

  let query = supabase.from("expansions").select("*");
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
  if (!body.title) return Response.json({ error: "title required" }, { status: 400 });

  const { data, error } = await supabase.from("expansions").insert({
    song_id: body.song_id,
    title: body.title.trim(),
    slug: body.slug?.trim() || slugify(body.title),
    body: body.body || "",
    status: body.status || "draft",
    display_order: body.display_order ?? 0,
  }).select().single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data, { status: 201 });
}
