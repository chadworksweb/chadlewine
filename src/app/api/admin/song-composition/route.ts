import { createAdminClient } from "@/lib/supabase-server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const songId = searchParams.get("song_id");
  if (!songId) return Response.json({ error: "song_id required" }, { status: 400 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("song_composition")
    .select("*")
    .eq("song_id", songId)
    .single();

  if (error) return Response.json(null);
  return Response.json(data);
}

export async function PUT(request: Request) {
  const supabase = createAdminClient();
  const body = await request.json();
  if (!body.id) return Response.json({ error: "id required" }, { status: 400 });

  const allowed = ["content", "content_html", "status"];
  const updates: Record<string, unknown> = {};
  for (const f of allowed) { if (f in body) updates[f] = body[f]; }

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase.from("song_composition").update(updates).eq("id", body.id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }

  const { data } = await supabase.from("song_composition").select("*").eq("id", body.id).single();
  return Response.json(data);
}
