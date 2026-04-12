import { createAdminClient } from "@/lib/supabase-server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const songId = searchParams.get("song_id");
  if (!songId) return Response.json({ error: "song_id required" }, { status: 400 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("song_visibility_messages")
    .select("*")
    .eq("song_id", songId)
    .order("created_at");

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const songId = searchParams.get("song_id");
  if (!songId) return Response.json({ error: "song_id required" }, { status: 400 });

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("song_visibility_messages")
    .delete()
    .eq("song_id", songId);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
