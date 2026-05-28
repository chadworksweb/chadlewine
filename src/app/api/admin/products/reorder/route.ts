import { createAdminClient } from "@/lib/supabase-server";

// Bulk-set merch.display_order. Body: { ordered_ids: string[] }. The id at
// index 0 becomes display_order=1, index 1 -> 2, and so on. Rows not in the
// list are left untouched.
export async function POST(request: Request) {
  const supabase = createAdminClient();
  const body = await request.json();
  const ids = Array.isArray(body.ordered_ids) ? body.ordered_ids : null;
  if (!ids) return Response.json({ error: "ordered_ids array required" }, { status: 400 });

  // Update each row individually; the list is small (~30) so a sequential
  // update is fine. If this ever needs to scale, switch to a single upsert
  // or a server-side RPC.
  const errors: string[] = [];
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (typeof id !== "string") continue;
    const { error } = await supabase
      .from("merch")
      .update({ display_order: i + 1 })
      .eq("id", id);
    if (error) errors.push(`${id}: ${error.message}`);
  }
  if (errors.length > 0) {
    return Response.json({ error: errors.join("; ") }, { status: 500 });
  }
  return Response.json({ ok: true, count: ids.length });
}
