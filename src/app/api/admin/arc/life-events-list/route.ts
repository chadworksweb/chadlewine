import { createAdminClient } from "@/lib/supabase-server";

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("life_events")
    .select("id, slug, title, date_start, date_end, era_id, source, status, body_md")
    .order("date_start", { ascending: true, nullsFirst: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data ?? []);
}
