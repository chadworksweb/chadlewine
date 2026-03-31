import { createAdminClient } from "@/lib/supabase-server";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("curated_entries").select("*").eq("id", id).single();
  if (error) return Response.json({ error: error.message }, { status: 404 });
  return Response.json(data);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createAdminClient();
  const body = await request.json();

  const fields = [
    "type", "title", "slug", "artist_name", "description", "body",
    "cover_image_path", "outbound_url", "outbound_links",
    "rising_compass_score", "rising_compass_classification",
    "genre", "mood_tags", "seo_title", "seo_description", "focus_keyphrase",
    "status", "display_order",
  ];
  const updates: Record<string, unknown> = {};
  for (const f of fields) {
    if (f in body) updates[f] = body[f];
  }

  // Set published_at on first publish
  if (body.status === "published") {
    const { data: existing } = await supabase.from("curated_entries").select("published_at").eq("id", id).single();
    if (!existing?.published_at) {
      updates.published_at = new Date().toISOString();
    }
  }

  const { data, error } = await supabase.from("curated_entries").update(updates).eq("id", id).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createAdminClient();
  const { error } = await supabase.from("curated_entries").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
