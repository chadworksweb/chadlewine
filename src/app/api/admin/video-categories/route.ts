import { createAdminClient } from "@/lib/supabase-server";
import { slugify } from "@/lib/utils";

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("video_categories").select("*").order("display_order");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function POST(request: Request) {
  const supabase = createAdminClient();
  const body = await request.json();
  if (!body.title) return Response.json({ error: "title required" }, { status: 400 });
  const { data, error } = await supabase.from("video_categories").insert({
    title: body.title.trim(),
    slug: body.slug?.trim() || slugify(body.title),
    display_order: body.display_order || 0,
  }).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data, { status: 201 });
}
