import { createAdminClient } from "@/lib/supabase-server";
import { refreshAudienceTags } from "@/lib/audience";

// Refresh tags + engagement score for every audience row. Sync OK at our
// scale; chunk if the list grows past ~1000.
export async function POST() {
  const supabase = createAdminClient();
  const { data } = await supabase.from("audience").select("id");
  let count = 0;
  for (const r of data || []) {
    await refreshAudienceTags(r.id);
    count++;
  }
  return Response.json({ refreshed: count });
}
