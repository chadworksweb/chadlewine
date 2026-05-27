import { createAdminClient } from "@/lib/supabase-server";

// Admin inbox feed for concierge art inquiries. Joins the art title + SKU
// format/label so the queue is readable without extra lookups.
export async function GET(request: Request) {
  const supabase = createAdminClient();
  const url = new URL(request.url);
  const status = url.searchParams.get("status");

  let query = supabase
    .from("art_inquiries")
    .select(
      "id, art_id, art_sku_id, buyer_name, buyer_email, message, status, admin_notes, created_at, " +
        "art:art_pieces(title, slug), sku:art_skus(format, sku_code, price)",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (status && status !== "all") query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data || []);
}
