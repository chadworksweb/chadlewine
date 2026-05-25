import { createAdminClient } from "@/lib/supabase-server";

// Candidate search for the EntityPicker. Returns id + title + slug + image per
// entity type, using current vocabulary (release -> releases). Optional ?q=.
const META: Record<string, { table: string; image: string; orderBy: string }> = {
  song: { table: "songs", image: "art_image_path", orderBy: "release_date" },
  release: { table: "releases", image: "cover_art_path", orderBy: "release_date" },
  merch: { table: "merch", image: "image_url", orderBy: "created_at" },
  art: { table: "art_pieces", image: "image_path", orderBy: "display_order" },
  observation: { table: "observations", image: "art_image_path", orderBy: "date_captured" },
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const type = url.searchParams.get("type") || "";
  const q = (url.searchParams.get("q") || "").trim();
  const meta = META[type];
  if (!meta) return Response.json({ error: "invalid type" }, { status: 400 });

  const supabase = createAdminClient();
  let query = supabase
    .from(meta.table)
    .select(`id, title, slug, ${meta.image}`)
    .order(meta.orderBy, { ascending: type === "art", nullsFirst: false })
    .limit(q ? 30 : 100);
  if (q) query = query.ilike("title", `%${q}%`);

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const rows = ((data as unknown as Record<string, unknown>[]) || []).map((r) => ({
    id: r.id as string,
    title: r.title as string,
    slug: (r.slug as string) ?? null,
    image: (r[meta.image] as string) ?? null,
  }));
  return Response.json(rows);
}
