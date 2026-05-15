import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase-server";
import { AudienceDetail, type AudienceDetailData } from "@/components/AudienceDetail";

export const dynamic = "force-dynamic";

export default async function AdminAudienceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createAdminClient();

  const [audRes, tagsRes, eventsRes, ordersRes] = await Promise.all([
    supabase.from("audience").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("audience_tags")
      .select("tag, added_at")
      .eq("audience_id", id)
      .order("added_at", { ascending: false }),
    supabase
      .from("audience_events")
      .select("id, event_type, metadata, occurred_at")
      .eq("audience_id", id)
      .order("occurred_at", { ascending: false })
      .limit(200),
    supabase
      .from("orders")
      .select("id, order_number, status, total, created_at")
      .eq("audience_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (!audRes.data) notFound();

  const data: AudienceDetailData = {
    audience: audRes.data,
    tags: (tagsRes.data || []) as { tag: string; added_at: string }[],
    events: (eventsRes.data || []) as AudienceDetailData["events"],
    orders: (ordersRes.data || []) as AudienceDetailData["orders"],
  };

  return <AudienceDetail initial={data} />;
}
