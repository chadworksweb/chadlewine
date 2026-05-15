import { createAdminClient } from "@/lib/supabase-server";

// Returns the universe of tags currently assigned across all audience
// rows. Used by the campaign editor + admin filter chips so suggestions
// reflect actual data, not a hardcoded list.
export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("audience_tags")
    .select("tag");
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  const counts = new Map<string, number>();
  for (const r of data || []) {
    counts.set(r.tag, (counts.get(r.tag) || 0) + 1);
  }
  const result = Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
  return Response.json(result);
}
