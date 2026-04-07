import { createAdminClient } from "@/lib/supabase-server";

export async function GET() {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("songs")
    .select("id, title, slug")
    .eq("featured", true)
    .limit(1)
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function PUT(request: Request) {
  const supabase = createAdminClient();
  const { song_id } = await request.json();

  if (!song_id) {
    return Response.json({ error: "song_id required" }, { status: 400 });
  }

  // Clear existing featured
  const { error: clearErr } = await supabase
    .from("songs")
    .update({ featured: false })
    .eq("featured", true);

  if (clearErr) return Response.json({ error: clearErr.message }, { status: 500 });

  // Set new featured
  const { data, error } = await supabase
    .from("songs")
    .update({ featured: true })
    .eq("id", song_id)
    .select("id, title, slug")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}
