import { createAdminClient } from "@/lib/supabase-server";
import { slugify } from "@/lib/utils";

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("art_pieces").select("*").order("display_order");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function POST(request: Request) {
  const supabase = createAdminClient();
  const body = await request.json();
  if (!body.title || !body.image_path) return Response.json({ error: "title and image_path required" }, { status: 400 });

  const { data, error } = await supabase.from("art_pieces").insert({
    title: body.title.trim(),
    slug: body.slug?.trim() || slugify(body.title),
    medium: body.medium || null,
    image_path: body.image_path,
    image_alt: body.image_alt || null,
    description: body.description || null,
    display_order: body.display_order || 0,
    status: body.status || "draft",
  }).select().single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data, { status: 201 });
}
