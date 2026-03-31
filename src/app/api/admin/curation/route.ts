import { createAdminClient } from "@/lib/supabase-server";
import { slugify } from "@/lib/utils";

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("curated_entries")
    .select("*")
    .order("display_order");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function POST(request: Request) {
  const supabase = createAdminClient();
  const body = await request.json();
  if (!body.title) return Response.json({ error: "title required" }, { status: 400 });
  if (!body.artist_name) return Response.json({ error: "artist_name required" }, { status: 400 });

  const { data, error } = await supabase
    .from("curated_entries")
    .insert({
      type: body.type || "album",
      title: body.title.trim(),
      slug: body.slug?.trim() || slugify(body.title),
      artist_name: body.artist_name.trim(),
      description: body.description || null,
      body: body.body || null,
      cover_image_path: body.cover_image_path || null,
      outbound_url: body.outbound_url || null,
      outbound_links: body.outbound_links || [],
      rising_compass_score: body.rising_compass_score || null,
      rising_compass_classification: body.rising_compass_classification || null,
      genre: body.genre || null,
      mood_tags: body.mood_tags || [],
      seo_title: body.seo_title || null,
      seo_description: body.seo_description || null,
      focus_keyphrase: body.focus_keyphrase || null,
      status: body.status || "draft",
      display_order: body.display_order || 0,
      published_at: body.status === "published" ? new Date().toISOString() : null,
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data, { status: 201 });
}
