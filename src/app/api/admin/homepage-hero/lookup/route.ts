import { createAdminClient } from "@/lib/supabase-server";

const TABLE_BY_TYPE: Record<string, { table: string; orderBy: string }> = {
  song: { table: "songs", orderBy: "release_date" },
  release: { table: "releases", orderBy: "release_date" },
  merch: { table: "merch", orderBy: "created_at" },
  observation: { table: "posts", orderBy: "date_captured" },
  art: { table: "art_pieces", orderBy: "display_order" },
  video: { table: "videos", orderBy: "published_at" },
};

// Lightweight pickers for the admin Add UI — returns id+title+slug per type.
// Order varies by entity (most-recent first where it makes sense, manual order
// for art) so the dropdown shows the most useful items at the top.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const type = url.searchParams.get("type") || "";
  const meta = TABLE_BY_TYPE[type];
  if (!meta) return Response.json({ error: "invalid type" }, { status: 400 });

  const supabase = createAdminClient();
  const ascending = type === "art"; // art uses display_order ascending; others descending by date
  const { data, error } = await supabase
    .from(meta.table)
    .select("id, title, slug")
    .order(meta.orderBy, { ascending, nullsFirst: false })
    .limit(500);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data || []);
}
