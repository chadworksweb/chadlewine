import { createAdminClient } from "@/lib/supabase-server";

// Public endpoint — looks up most recent purchase by type + id
// Only returns download token, not the URL itself (URL is behind /api/download/[token])
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const id = searchParams.get("id");

  if (!type || !id) {
    return Response.json({ error: "type and id required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Find most recent purchase for this item in the last hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { data: purchase } = await supabase
    .from("purchases")
    .select("id, format, download_url, download_expires_at")
    .eq("item_type", type)
    .eq("item_id", id)
    .gte("created_at", oneHourAgo)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!purchase) {
    return Response.json({ status: "pending" });
  }

  return Response.json({
    status: purchase.download_url ? "ready" : "processing",
    token: purchase.id,
    format: purchase.format || null,
    has_download: !!purchase.download_url,
  });
}
