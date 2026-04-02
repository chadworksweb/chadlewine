import { createPublicClient } from "@/lib/supabase-server";
import { createMerchCheckoutSession } from "@/lib/stripe";

export async function POST(request: Request) {
  const formData = await request.formData();
  const productId = formData.get("product_id") as string;
  const format = formData.get("format") as string;
  const origin = request.headers.get("origin") || "https://chadlewine.com";

  if (!productId || !format || !["mp3", "wav", "ringtone"].includes(format)) {
    return Response.json({ error: "product_id and format (mp3/wav/ringtone) required" }, { status: 400 });
  }

  const supabase = createPublicClient();
  const { data: product } = await supabase
    .from("products")
    .select("id, title, price, source_observation_id")
    .eq("id", productId)
    .eq("tier", "diddy")
    .eq("status", "active")
    .single();

  if (!product) return Response.json({ error: "Diddy not found" }, { status: 404 });
  if (!product.price) return Response.json({ error: "No price set" }, { status: 400 });

  const formatLabels: Record<string, string> = {
    mp3: "MP3",
    wav: "WAV (Lossless)",
    ringtone: "Ringtone (M4R + MP3)",
  };

  // WAV costs $1 more, ringtone costs 75% of MP3
  const prices: Record<string, number> = {
    mp3: product.price,
    wav: product.price + 1,
    ringtone: Math.round(product.price * 0.75 * 100) / 100,
  };

  // Get observation slug for redirect
  let cancelUrl = `${origin}/merch`;
  if (product.source_observation_id) {
    const { data: obs } = await supabase
      .from("observations")
      .select("slug")
      .eq("id", product.source_observation_id)
      .single();
    if (obs) cancelUrl = `${origin}/observations/${obs.slug}`;
  }

  const session = await createMerchCheckoutSession({
    product_id: product.id,
    product_config: { type: "diddy", format, product_id: product.id },
    title: `${product.title} — ${formatLabels[format]}`,
    price: prices[format],
    success_url: `${origin}/music/purchase/digital-download-thank-you?type=diddy&id=${product.id}&format=${format}`,
    cancel_url: cancelUrl,
  });

  if (!session.url) return Response.json({ error: "No checkout URL" }, { status: 500 });

  // Redirect browser (form POST) to Stripe
  return Response.redirect(session.url, 303);
}
