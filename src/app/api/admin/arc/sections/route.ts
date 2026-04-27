import { createAdminClient } from "@/lib/supabase-server";

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("prose_sections")
    .select("id,slug,title,order_index,scope_kind,era_id,date_start,date_end,status,is_stale,stale_reasons,last_published_at,updated_at")
    .order("order_index");
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Attach dependency counts in a second query (cheap at v1 scale)
  const ids = (data ?? []).map((s) => s.id);
  let depCounts: Record<string, number> = {};
  if (ids.length > 0) {
    const { data: deps } = await supabase
      .from("prose_section_dependencies")
      .select("section_id")
      .in("section_id", ids);
    depCounts = (deps ?? []).reduce<Record<string, number>>((acc, row) => {
      acc[row.section_id] = (acc[row.section_id] ?? 0) + 1;
      return acc;
    }, {});
  }

  const rows = (data ?? []).map((s) => ({ ...s, dependency_count: depCounts[s.id] ?? 0 }));
  return Response.json(rows);
}
