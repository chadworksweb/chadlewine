import { createPublicClient } from "@/lib/supabase-server";

export const revalidate = 60;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);

  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("cl_stream_songs")
    .select("id, title, artist, album, note, source_url, rc_color, rc_charge, created_at")
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}
