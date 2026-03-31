import { createPublicClient } from "@/lib/supabase-server";

// TODO: Wire to Stripe checkout (same pattern as music-checkout)
// Flow: POST { product_id } → look up product → create Stripe session → return URL

export async function POST(request: Request) {
  const body = await request.json();
  const { product_id } = body;

  if (!product_id) {
    return Response.json({ error: "product_id required" }, { status: 400 });
  }

  const supabase = createPublicClient();

  const { data: product } = await supabase
    .from("products")
    .select("id, title, price, status")
    .eq("id", product_id)
    .eq("status", "active")
    .single();

  if (!product) return Response.json({ error: "Product not found" }, { status: 404 });
  if (!product.price) return Response.json({ error: "Product has no price" }, { status: 400 });

  // TODO: createMerchCheckoutSession() → Stripe → return { url }
  return Response.json({ error: "Merch checkout not yet implemented" }, { status: 501 });
}
