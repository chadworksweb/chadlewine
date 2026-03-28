import { createAdminClient } from "@/lib/supabase-server";
import { slugify } from "@/lib/utils";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const albumId = searchParams.get("album_id");
  const supabase = createAdminClient();

  let query = supabase.from("tracks").select("*").order("track_number");
  if (albumId) query = query.eq("album_id", albumId);

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function POST(request: Request) {
  const supabase = createAdminClient();
  const body = await request.json();
  if (!body.title || !body.album_id) return Response.json({ error: "title and album_id required" }, { status: 400 });

  const { data, error } = await supabase.from("tracks").insert({
    album_id: body.album_id,
    title: body.title.trim(),
    slug: body.slug?.trim() || slugify(body.title),
    track_number: body.track_number || 1,
    duration_seconds: body.duration_seconds || null,
    streaming_path: body.streaming_path || null,
    lyrics: body.lyrics || null,
    price_cents: body.price_cents || null,
    is_single: body.is_single || false,
    status: body.status || "draft",
  }).select().single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data, { status: 201 });
}
