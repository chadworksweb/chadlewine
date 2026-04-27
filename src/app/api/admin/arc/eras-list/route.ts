import { createAdminClient } from "@/lib/supabase-server";

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("eras")
    .select("id,slug,title,kind,date_start,date_end,album_id")
    .order("date_start", { ascending: true });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data ?? []);
}
