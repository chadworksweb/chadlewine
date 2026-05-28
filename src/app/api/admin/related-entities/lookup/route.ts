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

async function lookupType(
  supabase: ReturnType<typeof createAdminClient>,
  type: string,
  q: string,
  perTypeLimit: number,
) {
  const meta = META[type];
  if (!meta) return [];
  let query = supabase
    .from(meta.table)
    .select(`id, title, slug, ${meta.image}`)
    .order(meta.orderBy, { ascending: type === "art", nullsFirst: false })
    .limit(perTypeLimit);
  if (q) query = query.ilike("title", `%${q}%`);
  const { data, error } = await query;
  if (error) return [];
  return ((data as unknown as Record<string, unknown>[]) || []).map((r) => ({
    id: r.id as string,
    title: r.title as string,
    slug: (r.slug as string) ?? null,
    image: (r[meta.image] as string) ?? null,
    type,
  }));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const type = url.searchParams.get("type") || "";
  const q = (url.searchParams.get("q") || "").trim();

  // No type (or "all") => search across every content type, tagging each row
  // with its type. Powers the link picker's "search everything" box. A single
  // type keeps the original EntityPicker behaviour.
  const allTypes = !type || type === "all";
  if (!allTypes && !META[type]) {
    return Response.json({ error: "invalid type" }, { status: 400 });
  }

  const supabase = createAdminClient();

  if (!allTypes) {
    const rows = await lookupType(supabase, type, q, q ? 30 : 100);
    return Response.json(rows);
  }

  const perType = q ? 6 : 12;
  const batches = await Promise.all(
    Object.keys(META).map((t) => lookupType(supabase, t, q, perType)),
  );
  return Response.json(batches.flat());
}
