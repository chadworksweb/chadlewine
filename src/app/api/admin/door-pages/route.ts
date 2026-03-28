import { createAdminClient } from "@/lib/supabase-server";
import { slugify } from "@/lib/utils";

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("door_pages")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function POST(request: Request) {
  const supabase = createAdminClient();
  const body = await request.json();
  const { title, slug, body: pageBody, meta_title, meta_description, target_queries, funnel_targets, og_image_path, status } = body;

  if (!title) {
    return Response.json({ error: "title is required" }, { status: 400 });
  }

  const finalSlug = slug?.trim() || slugify(title);

  const { data, error } = await supabase
    .from("door_pages")
    .insert({
      title: title.trim(),
      slug: finalSlug,
      body: pageBody || "",
      meta_title: meta_title || null,
      meta_description: meta_description || null,
      target_queries: target_queries || [],
      funnel_targets: funnel_targets || [],
      og_image_path: og_image_path || null,
      status: status || "draft",
      published_at: status === "published" ? new Date().toISOString() : null,
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data, { status: 201 });
}
