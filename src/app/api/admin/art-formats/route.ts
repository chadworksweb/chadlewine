import { createAdminClient } from "@/lib/supabase-server";

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("art_formats").select("id, slug, label").order("label");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}
