import { createAdminClient } from "@/lib/supabase-server";
import { upsertAudienceFromSubscribe } from "@/lib/audience";

// GET /api/admin/audience — list all audience rows.
// Tags are joined per row so the list view can render tag chips.
export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("audience")
    .select(
      "id, email, display_name, user_id, subscriber_status, lifetime_orders, lifetime_spend, engagement_score, emails_received, emails_opened, emails_clicked, last_purchase_at, last_activity_at, created_at"
    )
    .order("last_activity_at", { ascending: false });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const ids = (data || []).map((r) => r.id);
  const tagsByAudience = new Map<string, string[]>();
  if (ids.length > 0) {
    const { data: tagRows } = await supabase
      .from("audience_tags")
      .select("audience_id, tag")
      .in("audience_id", ids);
    for (const r of tagRows || []) {
      const arr = tagsByAudience.get(r.audience_id) || [];
      arr.push(r.tag);
      tagsByAudience.set(r.audience_id, arr);
    }
  }

  const enriched = (data || []).map((r) => ({
    ...r,
    tags: tagsByAudience.get(r.id) || [],
  }));
  return Response.json(enriched);
}

// POST /api/admin/audience — manually add a contact (admin-only path).
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || !email.includes("@")) {
    return Response.json({ error: "Valid email required" }, { status: 400 });
  }
  const id = await upsertAudienceFromSubscribe({
    email,
    source_page: "admin-manual",
  });
  return Response.json({ id }, { status: 201 });
}
