import { createAdminClient } from "@/lib/supabase-server";

// Search art_pieces (the canonical art catalog) for the merch->print linking
// flow. Note: art_pieces is a separate table from products. The art tier in
// products is unused for the chadlewine catalog.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();

  const supabase = createAdminClient();
  let query = supabase
    .from("art_pieces")
    .select("id, slug, title")
    .order("title", { ascending: true });

  // Bound result size only when searching — empty browse returns the full
  // catalog so the picker can scroll through it without pagination.
  if (q.length > 0) query = query.ilike("title", `%${q}%`).limit(50);

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ results: data || [] });
}
