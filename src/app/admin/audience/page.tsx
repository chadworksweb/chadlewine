import { createAdminClient } from "@/lib/supabase-server";
import { AudienceAdmin, type AudienceListRow, type UnsubRequestRow } from "@/components/AudienceAdmin";

export const dynamic = "force-dynamic";

export default async function AdminAudiencePage() {
  const supabase = createAdminClient();

  const [audienceRes, tagsRes, requestsRes] = await Promise.all([
    supabase
      .from("audience")
      .select(
        "id, email, display_name, user_id, subscriber_status, lifetime_orders, lifetime_spend, engagement_score, emails_received, emails_opened, emails_clicked, last_purchase_at, last_activity_at, created_at"
      )
      .order("last_activity_at", { ascending: false }),
    supabase.from("audience_tags").select("audience_id, tag"),
    supabase
      .from("unsubscribe_requests")
      .select("id, email, reason, source_page, status, created_at")
      .order("created_at", { ascending: false }),
  ]);

  const rows = (audienceRes.data || []) as Omit<AudienceListRow, "tags">[];
  const tagsByAudience = new Map<string, string[]>();
  for (const r of tagsRes.data || []) {
    const arr = tagsByAudience.get(r.audience_id) || [];
    arr.push(r.tag);
    tagsByAudience.set(r.audience_id, arr);
  }
  const audience: AudienceListRow[] = rows.map((r) => ({
    ...r,
    tags: tagsByAudience.get(r.id) || [],
  }));
  const requests = (requestsRes.data || []) as UnsubRequestRow[];

  return <AudienceAdmin audience={audience} requests={requests} />;
}
