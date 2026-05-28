import { createAdminClient } from "@/lib/supabase-server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return Response.json({ error: "Invalid id" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("campaign_sends")
    .select(
      "id, audience_id, email, status, is_test, resend_id, error, sent_at, delivered_at, opened_at, last_opened_at, open_count, clicked_at, last_clicked_at, click_count, bounced_at, bounce_reason, bounce_type, complained_at"
    )
    .eq("campaign_id", id)
    .order("sent_at", { ascending: true, nullsFirst: false });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json(data || []);
}
