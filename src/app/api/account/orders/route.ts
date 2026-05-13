import { getCurrentSession } from "@/lib/account";
import { createAdminClient } from "@/lib/supabase-server";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, status, total, created_at, has_digital_lines, has_printify_lines, tracking_number, tracking_url"
    )
    .eq("audience_id", session.audienceId)
    .order("created_at", { ascending: false });
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json(data || []);
}
