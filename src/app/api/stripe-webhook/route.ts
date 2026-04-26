import { createAdminClient } from "@/lib/supabase-server";
import { verifyWebhookSignature } from "@/lib/stripe";
import { sendEmail, buildCartConfirmationHtml } from "@/lib/email";

const SITE_URL = process.env.SITE_URL || "https://chadlewine.com";

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

    if (itemType === "cart") {
      // Multi-item cart — one orders row + one purchase row per line.
      // Pure-digital orders auto-complete; orders with any physical line land
      // in pending_review so admin can approve before pushing to Printify.
      // Cart payload is in session.metadata.cart_items as compact JSON. Any
      // configurator merch line stores its full product_config in cfg_<idx>.
      const rawCart = session.metadata?.cart_items;
      type CartLine = {
        t: "s" | "a" | "r" | "m" | "o";
        i: string | null;
        f?: "mp3" | "flac" | "wav" | null;
        c?: number;
      };
      let cartLines: CartLine[] = [];
      try {
        const parsed = rawCart ? JSON.parse(rawCart) : [];
        if (Array.isArray(parsed)) cartLines = parsed as CartLine[];
      } catch {
        console.error("[stripe-webhook] Failed to parse cart_items metadata");
      }

      if (cartLines.length === 0) {
        return Response.json({ error: "Empty cart payload" }, { status: 400 });
      }

      const buyerEmail = session.customer_details?.email || "unknown";

      // Idempotency: if we already have an order for this Stripe session, skip.
      // Stripe retries webhooks, and we don't want duplicate purchase rows.
      const sessionId = session.id;
      let orderId: string | null = null;
      if (sessionId) {
        const { data: existing } = await supabase
          .from("orders")
          .select("id")
          .eq("stripe_session_id", sessionId)
          .maybeSingle();
        if (existing) {
          return Response.json({ received: true, deduped: true });
        }
      }

      const hasPhysicalLines = cartLines.some(
        (l) => l.t === "m" || l.t === "o",
      );
      const hasDigitalLines = cartLines.some(
        (l) => l.t === "s" || l.t === "a" || l.t === "r",
      );

      const orderStatus = hasPhysicalLines ? "pending_review" : "completed";

      // Stripe's TS types renamed/moved shipping_details across API versions;
      // the field is still on the wire so we read it via a narrowed cast.
      const sessionWithShipping = session as typeof session & {
        shipping_details?: {
          name?: string | null;
          address?: {
            line1?: string | null;
            line2?: string | null;
            city?: string | null;
            state?: string | null;
            postal_code?: string | null;
            country?: string | null;
          };
        } | null;
        collected_information?: {
          shipping_details?: {
            name?: string | null;
            address?: {
              line1?: string | null;
              line2?: string | null;
              city?: string | null;
              state?: string | null;
              postal_code?: string | null;
              country?: string | null;
            };
          };
        } | null;
      };
      const shippingDetails =
        sessionWithShipping.shipping_details ||
        sessionWithShipping.collected_information?.shipping_details ||
        null;
      const ship = shippingDetails?.address || null;
      const shipName = shippingDetails?.name || session.customer_details?.name || null;

      const subtotal = (session.amount_subtotal || 0) / 100;
      const shipping = (session.total_details?.amount_shipping || 0) / 100;
      const tax = (session.total_details?.amount_tax || 0) / 100;
      const total = (session.amount_total || 0) / 100;

      const { data: orderRow, error: orderErr } = await supabase
        .from("orders")
        .insert({
          status: orderStatus,
          buyer_email: buyerEmail,
          buyer_name: shipName,
          ship_line1: ship?.line1 || null,
          ship_line2: ship?.line2 || null,
          ship_city: ship?.city || null,
          ship_state: ship?.state || null,
          ship_zip: ship?.postal_code || null,
          ship_country: ship?.country || null,
          subtotal,
          shipping,
          tax,
          total,
          stripe_session_id: sessionId || null,
          stripe_payment_intent_id: session.payment_intent || null,
          has_printify_lines: hasPhysicalLines,
          has_digital_lines: hasDigitalLines,
        })
        .select("id")
        .single();

      if (orderErr || !orderRow) {
        console.error("[stripe-webhook] Failed to insert order:", orderErr?.message);
        return Response.json({ error: "Order insert failed" }, { status: 500 });
      }
      orderId = orderRow.id;
      type FormatKey = "mp3" | "flac" | "wav";
      type RingtoneFormat = "m4r" | "mp3";
      type EmailItemType = "song" | "album" | "ringtone" | "merch" | "art_original";
      const emailItems: Array<{
        title: string;
        type: EmailItemType;
        formatLinks?: Array<{ format: FormatKey | RingtoneFormat; url: string }>;
        fulfillmentNote?: string;
      }> = [];

      for (const line of cartLines) {
        const lineType: EmailItemType =
          line.t === "s"
            ? "song"
            : line.t === "a"
              ? "album"
              : line.t === "r"
                ? "ringtone"
                : line.t === "o"
                  ? "art_original"
                  : "merch";
        const format: FormatKey | null =
          line.f === "mp3" || line.f === "flac" || line.f === "wav" ? line.f : null;

        let itemTitle = "";
        let availableFormats: FormatKey[] = [];
        let ringtonePlatforms: RingtoneFormat[] = [];

        if (lineType === "song") {
          const { data: song } = await supabase
            .from("songs")
            .select("title, download_path_mp3, download_path_flac, download_path_wav, download_path")
            .eq("id", line.i!)
            .single();
          itemTitle = song?.title || "Your song";
          availableFormats = (["mp3", "flac", "wav"] as FormatKey[]).filter(
            (f) => (song as Record<string, unknown> | null)?.[`download_path_${f}`],
          );
          if (!availableFormats.length && song?.download_path) availableFormats = ["mp3"];
        } else if (lineType === "ringtone") {
          const { data: song } = await supabase
            .from("songs")
            .select("title, ringtone_path_m4r, ringtone_path_mp3")
            .eq("id", line.i!)
            .single();
          itemTitle = song?.title ? `${song.title} — Ringtone` : "Your ringtone";
          ringtonePlatforms = (["m4r", "mp3"] as RingtoneFormat[]).filter(
            (f) => (song as Record<string, unknown> | null)?.[`ringtone_path_${f}`],
          );
        } else if (lineType === "album") {
          const { data: album } = await supabase
            .from("albums")
            .select("title, download_path_mp3, download_path_flac, download_path_wav")
            .eq("id", line.i!)
            .single();
          itemTitle = album?.title || "Your album";
          availableFormats = (["mp3", "flac", "wav"] as FormatKey[]).filter(
            (f) => (album as Record<string, unknown> | null)?.[`download_path_${f}`],
          );
        } else if (lineType === "merch" && typeof line.c === "number") {
          // Configurator product — title from cfg_<idx>.
          const cfgRaw = session.metadata?.[`cfg_${line.c}`];
          let cfg: Record<string, unknown> = {};
          try { if (cfgRaw) cfg = JSON.parse(cfgRaw); } catch { /* ignore */ }
          const tierLabel =
            cfg.tier === "art" ? "The Art" : cfg.tier === "line" ? "The Line" : "The Fusion";
          itemTitle = `${tierLabel} — Custom merch`;
        } else {
          // Existing product (merch print or art_original) — title from products.
          if (line.i) {
            const { data: product } = await supabase
              .from("products")
              .select("title")
              .eq("id", line.i)
              .single();
            itemTitle = product?.title || (lineType === "art_original" ? "Original artwork" : "Merch");
          } else {
            itemTitle = lineType === "art_original" ? "Original artwork" : "Merch";
          }
        }

        // Capture configurator config snapshot if this is a configurator line
        let configSnapshot: Record<string, unknown> | null = null;
        if (lineType === "merch" && typeof line.c === "number") {
          const cfgRaw = session.metadata?.[`cfg_${line.c}`];
          try { if (cfgRaw) configSnapshot = JSON.parse(cfgRaw); } catch { /* ignore */ }
        }

        // Insert purchase row, linked to the parent order
        const { data: purchase, error: purchaseError } = await supabase
          .from("purchases")
          .insert({
            order_id: orderId,
            buyer_email: buyerEmail,
            item_type: lineType,
            item_id: line.i,
            format,
            stripe_payment_intent_id: session.payment_intent || null,
            amount: 0,
            title_snapshot: itemTitle,
            product_config_snapshot: configSnapshot,
            download_url: null,
            download_expires_at: null,
          })
          .select("id")
          .single();

        if (purchaseError || !purchase) {
          console.error("[stripe-webhook] Failed to insert cart purchase:", purchaseError?.message);
          continue;
        }

        // Side-effects for physical lines: edition counter, art_piece sold flag,
        // configurator product_submission row.
        if ((lineType === "merch" || lineType === "art_original") && line.i) {
          const { error: rpcErr } = await supabase.rpc("increment_editions_sold", { p_product_id: line.i });
          if (rpcErr) console.error("[stripe-webhook] increment_editions_sold failed:", rpcErr.message);

          if (lineType === "art_original") {
            const { data: product } = await supabase
              .from("products")
              .select("source_art_id")
              .eq("id", line.i)
              .single();
            if (product?.source_art_id) {
              await supabase.from("art_pieces").update({ sold: true }).eq("id", product.source_art_id);
            }
          }
        }
        // Build email entry
        if (buyerEmail !== "unknown") {
          if (lineType === "merch" || lineType === "art_original") {
            emailItems.push({
              title: itemTitle,
              type: lineType,
              fulfillmentNote: lineType === "art_original"
                ? "We'll be in touch shortly to arrange shipping for your original."
                : "Custom production takes 1–2 weeks. We'll email you when it ships.",
            });
          } else {
            const tokenBase = `${SITE_URL}/api/download/${purchase.id}`;
            let formatLinks: Array<{ format: FormatKey | RingtoneFormat; url: string }>;
            if (lineType === "ringtone") {
              formatLinks = ringtonePlatforms.map((f) => ({
                format: f,
                url: `${tokenBase}?format=${f}`,
              }));
            } else if (format) {
              formatLinks = [{ format, url: tokenBase }];
            } else {
              formatLinks = availableFormats.map((f) => ({
                format: f,
                url: `${tokenBase}?format=${f}`,
              }));
            }
            emailItems.push({ title: itemTitle, type: lineType, formatLinks });
          }
        }
      }

      if (emailItems.length > 0 && buyerEmail !== "unknown") {
        const recoverUrl = `${SITE_URL}/music/recover`;
        const html = buildCartConfirmationHtml({ items: emailItems, recoverUrl });
        const sent = await sendEmail({
          to: buyerEmail,
          subject: `Your order — ${emailItems.length} item${emailItems.length === 1 ? "" : "s"}`,
          html,
        });
        if (!sent) {
          console.warn(`[stripe-webhook] Failed to send cart confirmation to ${buyerEmail}`);
        }
      }
    } else {
      // Patronage — only path that doesn't go through the cart (donation flow).
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
