import { createAdminClient } from "@/lib/supabase-server";
import { computeCrossSell, type CartRef } from "@/lib/cross-sell";

// GET /api/cross-sell/from-session?session_id=...
// Post-purchase "complete the collection": resolves the order's purchased items
// (from the purchases linked to the Stripe session) and cross-sells off them.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("session_id");
  if (!sessionId) return Response.json({ products: [] });

  const supabase = createAdminClient();

  // session -> order -> purchases (the purchases link to orders via order_id).
  const { data: order } = await supabase
    .from("orders")
    .select("id")
    .eq("stripe_session_id", sessionId)
    .maybeSingle();
  if (!order) return Response.json({ products: [] });

  const { data: purchases } = await supabase
    .from("purchases")
    .select("item_type, item_id")
    .eq("order_id", order.id);

  const items: CartRef[] = (purchases || []).map((p) => ({
    type: p.item_type,
    id: p.item_id,
  }));

  return Response.json({ products: await computeCrossSell(items) });
}
