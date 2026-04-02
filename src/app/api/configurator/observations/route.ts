import { createPublicClient } from "@/lib/supabase-server";

export async function GET() {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("observations")
    .select("id, title, slug, art_image_path, hook_line, merch_lines")
    .eq("status", "published")
    .or("art_image_path.neq.,merch_lines.neq.{},hook_line.neq.")
    .order("date_captured", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}
