import { createPublicClient } from "@/lib/supabase-server";
import { createMerchCheckoutSession } from "@/lib/stripe";

export async function POST(request: Request) {
  const body = await request.json();
  const origin = request.headers.get("origin") || "https://chadlewine.com";

  // Flow 1: Existing product by ID
  if (body.product_id) {
    const supabase = createPublicClient();
    const { data: product } = await supabase
      .from("products")
      .select("id, title, price, status")
      .eq("id", body.product_id)
      .eq("status", "active")
      .single();

    if (!product) return Response.json({ error: "Product not found" }, { status: 404 });
    if (!product.price) return Response.json({ error: "Product has no price" }, { status: 400 });

    const session = await createMerchCheckoutSession({
      product_id: product.id,
      product_config: { product_id: product.id },
      title: product.title,
      price: product.price,
      success_url: `${origin}/merch/checkout?success=true`,
      cancel_url: `${origin}/merch`,
    });

    if (!session.url) return Response.json({ error: "No checkout URL" }, { status: 500 });
    return Response.json({ url: session.url });
  }

  // Flow 2: Configurator checkout
  if (body.product_config) {
    const config = body.product_config;
    if (!config.tier || !config.blueprint_id || !config.variant_id) {
      return Response.json({ error: "Incomplete product configuration" }, { status: 400 });
    }

    const price = typeof body.price === "number" && body.price > 0 ? body.price : 34.99;
    const tierLabel =
      config.tier === "art" ? "The Art" : config.tier === "line" ? "The Line" : "The Fusion";
    const title = `${tierLabel} — ${config.blueprint_title || "Custom Product"}`;

    const session = await createMerchCheckoutSession({
      product_config: config,
      title,
      price,
      success_url: `${origin}/merch/checkout?success=true&config=${encodeURIComponent(JSON.stringify({ tier: config.tier, observation: config.observation_title }))}`,
      cancel_url: `${origin}/merch/configure`,
    });

    if (!session.url) return Response.json({ error: "No checkout URL" }, { status: 500 });
    return Response.json({ url: session.url });
  }

  return Response.json({ error: "product_id or product_config required" }, { status: 400 });
}
