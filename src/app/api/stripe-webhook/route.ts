import { createAdminClient } from "@/lib/supabase-server";
import { verifyWebhookSignature } from "@/lib/stripe";
import { sendEmail, buildPurchaseConfirmationHtml } from "@/lib/email";

const SITE_URL = "https://chadlewine.com";

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
      // Music purchase — permanent download link, recovery via /music/recover
      const CDN_BASE = "https://chadrising-audio-downloads.b-cdn.net";
      const rawFormat = session.metadata?.format;
      const format: "mp3" | "flac" | "wav" =
        rawFormat === "flac" || rawFormat === "wav" ? rawFormat : "mp3";
      let downloadUrl: string | null = null;
      let itemTitle = "";

      const resolveUrl = (path: string | null | undefined): string | null => {
        if (!path) return null;
        return path.startsWith("http") ? path : `${CDN_BASE}/${path}`;
      };

      if (itemType === "song") {
        const { data: song } = await supabase
          .from("songs")
          .select("title, download_path, download_path_mp3, download_path_flac, download_path_wav")
          .eq("id", itemId)
          .single();
        itemTitle = song?.title || "Your song";
        const byFormat = (song as Record<string, string | null> | null)?.[`download_path_${format}`];
        downloadUrl = resolveUrl(byFormat || song?.download_path || null);
      } else {
        const { data: album } = await supabase
          .from("albums")
          .select("title, download_path_mp3, download_path_flac, download_path_wav")
          .eq("id", itemId)
          .single();
        itemTitle = album?.title || "Your album";
        const byFormat = (album as Record<string, string | null> | null)?.[`download_path_${format}`];
        downloadUrl = resolveUrl(byFormat || null);

        // Legacy fallback — no album-level format path, grab first track's download_path
        if (!downloadUrl && format === "mp3") {
          const { data: albumSongs } = await supabase
            .from("album_songs")
            .select("songs(download_path)")
            .eq("album_id", itemId)
            .order("track_number");
          const firstWithPath = albumSongs?.find(
            (as: unknown) => ((as as Record<string, unknown>).songs as Record<string, unknown>)?.download_path
          );
          if (firstWithPath) {
            const songData = (firstWithPath as unknown as Record<string, unknown>).songs as Record<string, unknown>;
            downloadUrl = resolveUrl(songData.download_path as string);
          }
        }
      }

      const buyerEmail = session.customer_details?.email || "unknown";

      const { data: purchase, error: purchaseError } = await supabase
        .from("purchases")
        .insert({
          buyer_email: buyerEmail,
          item_type: itemType,
          item_id: itemId,
          format,
          stripe_payment_intent_id: session.payment_intent || null,
          amount: (session.amount_total || 0) / 100,
          download_url: downloadUrl,
          download_expires_at: null,
        })
        .select("id")
        .single();

      if (purchaseError) {
        console.error("[stripe-webhook] Failed to insert purchase:", purchaseError.message);
        return Response.json({ error: "Database insert failed" }, { status: 500 });
      }

      if (purchase && buyerEmail !== "unknown") {
        const tokenUrl = `${SITE_URL}/api/download/${purchase.id}`;
        const recoverUrl = `${SITE_URL}/music/recover`;
        const html = buildPurchaseConfirmationHtml({
          itemTitle: `${itemTitle} (${format.toUpperCase()})`,
          itemType: itemType as "song" | "album",
          downloadUrl: tokenUrl,
          recoverUrl,
        });
        const sent = await sendEmail({
          to: buyerEmail,
          subject: `Your download — ${itemTitle} (${format.toUpperCase()})`,
          html,
        });
        if (!sent) {
          console.warn(`[stripe-webhook] Failed to send confirmation email to ${buyerEmail}`);
        }
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
