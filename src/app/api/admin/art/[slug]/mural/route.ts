import { createAdminClient } from "@/lib/supabase-server";

type Ctx = { params: Promise<{ slug: string }> };

const FIELDS = [
  "street_address", "venue_name", "venue_type", "venue_url",
  "neighborhood", "city", "region", "country",
  "latitude", "longitude",
  "width_ft", "height_ft", "indoor",
  "completion_date", "wall_status", "viewable_hours",
  "commissioned_by", "public_topics",
];

async function resolveArtId(supabase: ReturnType<typeof createAdminClient>, slug: string) {
  const { data, error } = await supabase.from("art_pieces").select("id").eq("slug", slug).single();
  if (error || !data) return null;
  return data.id as string;
}

export async function GET(_req: Request, { params }: Ctx) {
  const { slug } = await params;
  const supabase = createAdminClient();
  const artId = await resolveArtId(supabase, slug);
  if (!artId) return Response.json({ error: "art piece not found" }, { status: 404 });

  const { data } = await supabase.from("mural_details").select("*").eq("art_id", artId).maybeSingle();
  return Response.json(data || null);
}

export async function PUT(request: Request, { params }: Ctx) {
  const { slug } = await params;
  const supabase = createAdminClient();
  const artId = await resolveArtId(supabase, slug);
  if (!artId) return Response.json({ error: "art piece not found" }, { status: 404 });

  const body = await request.json();
  const row: Record<string, unknown> = { art_id: artId, updated_at: new Date().toISOString() };
  for (const f of FIELDS) {
    if (f in body) row[f] = body[f];
  }

  const { data, error } = await supabase
    .from("mural_details")
    .upsert(row, { onConflict: "art_id" })
    .select()
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { slug } = await params;
  const supabase = createAdminClient();
  const artId = await resolveArtId(supabase, slug);
  if (!artId) return Response.json({ error: "art piece not found" }, { status: 404 });

  const { error } = await supabase.from("mural_details").delete().eq("art_id", artId);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
