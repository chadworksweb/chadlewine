import { createAdminClient } from "@/lib/supabase-server";
import { verifyWebhookSignature } from "@/lib/stripe";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return Response.json({ error: "Missing signature" }, { status: 400 });
  }

  const payload = await request.text();

  let event;
  try {
    event = verifyWebhookSignature(payload, signature);
  } catch (err) {
    console.error("[stripe-webhook] Signature verification failed:", (err as Error).message);
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = createAdminClient();

  if (event.type === "checkout.session.completed") {
    const session = event.data?.object;
    if (!session) {
      return Response.json({ error: "Missing session data" }, { status: 400 });
    }

    const itemType = session.metadata?.type;
    const itemId = session.metadata?.item_id;

    if (itemType === "merch") {
      // Merch purchase
      const productId = session.metadata?.product_id || null;
      const productConfig = session.metadata?.product_config || null;

      const { error: purchaseError } = await supabase.from("purchases").insert({
        buyer_email: session.customer_details?.email || "unknown",
        item_type: "merch",
        item_id: productId,
        stripe_payment_intent_id: session.payment_intent || null,
        amount: (session.amount_total || 0) / 100,
      });

      if (purchaseError) {
        console.error("[stripe-webhook] Failed to insert merch purchase:", purchaseError.message);
        return Response.json({ error: "Database insert failed" }, { status: 500 });
      }

      if (productId) {
        const { error: rpcErr } = await supabase.rpc("increment_editions_sold", { p_product_id: productId });
        if (rpcErr) console.error("[stripe-webhook] increment_editions_sold failed:", rpcErr.message);

        const { data: product } = await supabase
          .from("products")
          .select("variant_type, source_art_id")
          .eq("id", productId)
          .single();

        if (product?.variant_type === "original" && product.source_art_id) {
          await supabase.from("art_pieces").update({ sold: true }).eq("id", product.source_art_id);
        }
      }

      // If configurator purchase, auto-create product_submission for catalog review
      if (productConfig && session.customer_details?.email) {
        let config: Record<string, unknown> = {};
        try { config = JSON.parse(productConfig); } catch { /* ignore */ }

        if (config.tier && config.blueprint_id) {
          await supabase.from("product_submissions").insert({
            buyer_email: session.customer_details.email,
            product_config: config,
            status: "pending",
          });
        }
      }
    } else if (itemType && itemId && ["song", "album"].includes(itemType)) {
      // Music purchase — generate download URL
      const CDN_BASE = "https://chadrising-audio-downloads.b-cdn.net";
      let downloadUrl: string | null = null;
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      if (itemType === "song") {
        const { data: song } = await supabase
          .from("songs")
          .select("download_path")
          .eq("id", itemId)
          .single();
        if (song?.download_path) {
          downloadUrl = song.download_path.startsWith("http")
            ? song.download_path
            : `${CDN_BASE}/${song.download_path}`;
        }
      } else {
        // Album — get all song download paths
        const { data: albumSongs } = await supabase
          .from("album_songs")
          .select("song_id, songs(download_path, title)")
          .eq("album_id", itemId)
          .order("track_number");
        // For album, store first track URL as primary download
        // Full album download requires a zip — for now, point to first track
        const firstWithPath = albumSongs?.find(
          (as: unknown) => ((as as Record<string, unknown>).songs as Record<string, unknown>)?.download_path
        );
        if (firstWithPath) {
          const songData = (firstWithPath as unknown as Record<string, unknown>).songs as Record<string, unknown>;
          const path = songData.download_path as string;
          downloadUrl = path.startsWith("http") ? path : `${CDN_BASE}/${path}`;
        }
      }

      const { data: purchase, error: purchaseError } = await supabase
        .from("purchases")
        .insert({
          buyer_email: session.customer_details?.email || "unknown",
          item_type: itemType,
          item_id: itemId,
          stripe_payment_intent_id: session.payment_intent || null,
          amount: (session.amount_total || 0) / 100,
          download_url: downloadUrl,
          download_expires_at: expiresAt.toISOString(),
        })
        .select("id")
        .single();

      if (purchaseError) {
        console.error("[stripe-webhook] Failed to insert purchase:", purchaseError.message);
        return Response.json({ error: "Database insert failed" }, { status: 500 });
      }

      // TODO: Send download email via Resend/Postmark
      // Email would contain: https://chadlewine.com/music/purchase/download?token={purchase.id}
      if (purchase) {
        console.log(`[stripe-webhook] Download ready: /music/purchase/download?token=${purchase.id}`);
      }
    } else {
      // Patronage
      const observationId = session.metadata?.observation_id || null;

      const { error: insertError } = await supabase.from("patrons").insert({
        email: session.customer_details?.email || null,
        stripe_payment_intent_id: session.payment_intent || null,
        amount: (session.amount_total || 0) / 100,
        is_recurring: false,
        source_observation_id: observationId,
      });

      if (insertError) {
        console.error("[stripe-webhook] Failed to insert patron:", insertError.message);
        return Response.json({ error: "Database insert failed" }, { status: 500 });
      }
    }
  }

  return Response.json({ received: true });
}
