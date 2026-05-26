import { createAdminClient } from "@/lib/supabase-server";
import { verifyWebhookSignature, listSessionLineItems } from "@/lib/stripe";
import { resolveSkuDownloadPaths } from "@/lib/release-skus";
import {
  sendEmail,
  buildOrderConfirmationHtml,
  buildAdminOrderNotificationHtml,
  type OrderEmailLine,
} from "@/lib/email";

const SITE_URL = process.env.SITE_URL || "https://chadlewine.com";
const ADMIN_NOTIFY_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || "portal@chadlewine.com";

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
      const rawCart = session.metadata?.cart_items;
      // New compact shape: sk = sku_id, v = sku_variant_id. When sk is set,
      // the SKU encodes the parent (release/song) — i is omitted on those
      // lines. Legacy lines (no sk) still carry i.
      type CartLine = {
        t: "s" | "a" | "r" | "m" | "o";
        i?: string | null;
        sk?: string;
        v?: string;
        f?: "mp3" | "flac" | "wav" | null;
        c?: number;
        // pf = 1 marks a physical music SKU (vinyl/cd/cassette). Its line type
        // is still "release"/"song", so it needs an explicit physical flag.
        pf?: number;
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

      // Idempotency: if we already have an order for this Stripe session,
      // skip the entire path (no duplicate purchases, no stock double-decrement).
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

      // Any physical line (merch/art OR a physical music SKU marked pf) needs
      // admin action before fulfilment, so the order lands in pending_review.
      // The precise printify-vs-manual split is tallied during the line loop
      // (a line's fulfilment isn't in the metadata) and written back after.
      const hasPhysicalLines = cartLines.some(
        (l) => l.t === "m" || l.t === "o" || l.pf === 1,
      );
      const hasDigitalLines = cartLines.some(
        (l) => l.t === "s" || l.t === "a" || l.t === "r",
      );

      const orderStatus = hasPhysicalLines ? "pending_review" : "completed";
      let sawPrintifyLine = false;
      let sawManualPhysicalLine = false;

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
          // Precise printify/manual split is tallied in the line loop below
          // and written back via a follow-up update.
          has_printify_lines: false,
          has_manual_physical_lines: false,
          has_digital_lines: hasDigitalLines,
        })
        .select("id, order_number")
        .single();

      if (orderErr || !orderRow) {
        console.error("[stripe-webhook] Failed to insert order:", orderErr?.message);
        return Response.json({ error: "Order insert failed" }, { status: 500 });
      }
      orderId = orderRow.id;
      const newOrderId: string = orderRow.id;
      const orderNumber: string = orderRow.order_number;

      const marketingOptIn = session.metadata?.marketing_opt_in === "true";
      let audienceId: string | null = null;
      try {
        const { upsertAudienceFromPurchase } = await import("@/lib/audience");
        audienceId = await upsertAudienceFromPurchase({
          email: buyerEmail,
          display_name: shipName,
          shipping: ship
            ? {
                line1: ship.line1 || null,
                line2: ship.line2 || null,
                city: ship.city || null,
                state: ship.state || null,
                postal_code: ship.postal_code || null,
                country: ship.country || null,
              }
            : null,
          marketing_opt_in: marketingOptIn,
          order_id: newOrderId,
          order_number: orderNumber,
          total,
        });
        await supabase.from("orders").update({ audience_id: audienceId }).eq("id", newOrderId);

        const amountDiscount = session.total_details?.amount_discount || 0;
        if (amountDiscount > 0 && audienceId) {
          const memberCouponId = session.metadata?.member_coupon_id;
          const nowIso = new Date().toISOString();
          let redeemed: Array<{ id: string; code: string; percent_off: number }> | null = null;

          if (memberCouponId) {
            const { data } = await supabase
              .from("member_coupons")
              .update({
                redeemed_at: nowIso,
                redeemed_order_id: newOrderId,
                updated_at: nowIso,
              })
              .eq("id", memberCouponId)
              .eq("audience_id", audienceId)
              .is("redeemed_at", null)
              .select("id, code, percent_off");
            redeemed = data;
          }

          if (!redeemed || redeemed.length === 0) {
            const promotionCodeIds: string[] = [];
            for (const d of session.discounts || []) {
              const pc = (d as { promotion_code?: string | { id?: string } }).promotion_code;
              if (typeof pc === "string") promotionCodeIds.push(pc);
              else if (pc && typeof pc === "object" && pc.id) promotionCodeIds.push(pc.id);
            }
            if (promotionCodeIds.length > 0) {
              const { data } = await supabase
                .from("member_coupons")
                .update({
                  redeemed_at: nowIso,
                  redeemed_order_id: newOrderId,
                  updated_at: nowIso,
                })
                .in("stripe_promotion_code_id", promotionCodeIds)
                .eq("audience_id", audienceId)
                .is("redeemed_at", null)
                .select("id, code, percent_off");
              redeemed = data;
            }
          }

          if (redeemed && redeemed.length > 0) {
            await supabase.from("audience_events").insert({
              audience_id: audienceId,
              event_type: "coupon_redeemed",
              metadata: {
                order_id: newOrderId,
                amount_discount_cents: amountDiscount,
                codes: redeemed.map((r) => r.code),
                scope: session.metadata?.coupon_scope || null,
              },
            });
          }
        }

        const stripeCustomerId =
          typeof session.customer === "string"
            ? session.customer
            : session.customer?.id;
        if (stripeCustomerId && audienceId) {
          await supabase
            .from("audience")
            .update({ stripe_customer_id: stripeCustomerId })
            .eq("id", audienceId)
            .is("stripe_customer_id", null);
        }
      } catch (e) {
        console.error("[stripe-webhook] audience upsert failed:", e);
      }

      let stripeLineAmounts: number[] = [];
      try {
        if (sessionId) {
          const li = await listSessionLineItems(sessionId);
          stripeLineAmounts = li.data.map((x) => (x.amount_total ?? 0) / 100);
        }
      } catch (e) {
        console.warn("[stripe-webhook] listLineItems failed:", (e as Error).message);
      }
      type FormatKey = "mp3" | "flac" | "wav";
      type RingtoneFormat = "m4r" | "mp3";
      type EmailItemType = "song" | "release" | "ringtone" | "merch" | "art_original";
      const emailItems: OrderEmailLine[] = [];

      for (let idx = 0; idx < cartLines.length; idx++) {
        const line = cartLines[idx];
        const lineType: EmailItemType =
          line.t === "s"
            ? "song"
            : line.t === "a"
              ? "release"
              : line.t === "r"
                ? "ringtone"
                : line.t === "o"
                  ? "art_original"
                  : "merch";
        const format: FormatKey | null =
          line.f === "mp3" || line.f === "flac" || line.f === "wav" ? line.f : null;

        let itemTitle = "";
        let variantNote: string | undefined;
        let imageUrl: string | undefined;
        let availableFormats: FormatKey[] = [];
        let ringtonePlatforms: RingtoneFormat[] = [];

        // SKU resolution. When the cart line carries `sk`, prefer the SKU
        // row's data (price, format, download paths, stock) over the parent
        // row. Legacy lines (no sk) keep the old item_id-based lookups.
        let resolvedReleaseSkuId: string | null = null;
        let resolvedSongSkuId: string | null = null;
        const resolvedVariantId: string | null = line.v || null;
        let resolvedItemId: string | null = line.i || null;

        if (lineType === "song") {
          if (line.sk) {
            const { data: sku } = await supabase
              .from("song_skus")
              .select("id, song_id, format, fulfillment_method, download_path_mp3, download_path_flac, download_path_wav, stock")
              .eq("id", line.sk)
              .single();
            if (sku) {
              resolvedSongSkuId = sku.id;
              resolvedItemId = sku.song_id;
              if (sku.format !== "digital") {
                if (sku.fulfillment_method === "printify") sawPrintifyLine = true;
                else sawManualPhysicalLine = true;
              }
              // Effective paths: own for digital, sibling digital SKU for
              // physical (vinyl/cd/cassette) so the included digital copy ships.
              const { bySongSku } = await resolveSkuDownloadPaths(supabase, [], [sku.id]);
              const paths = bySongSku.get(sku.id);
              availableFormats = (["mp3", "flac", "wav"] as FormatKey[]).filter(
                (f) => paths?.[f],
              );
              const { data: songRow } = await supabase
                .from("songs")
                .select("title, art_image_path")
                .eq("id", sku.song_id)
                .single();
              itemTitle = songRow?.title || "Your song";
              imageUrl = songRow?.art_image_path || undefined;
              if (!imageUrl && sku.song_id) {
                const { data: assoc } = await supabase
                  .from("release_songs")
                  .select("release:releases(cover_art_path)")
                  .eq("song_id", sku.song_id)
                  .single();
                imageUrl =
                  (assoc as { release?: { cover_art_path?: string | null } } | null)?.release
                    ?.cover_art_path || undefined;
              }
            }
          } else {
            // Song line without a SKU reference. No new purchases create these
            // (songs are SKU-only); resolve title/image for the email only.
            const { data: song } = await supabase
              .from("songs")
              .select("title, art_image_path")
              .eq("id", line.i!)
              .single();
            itemTitle = song?.title || "Your song";
            imageUrl = song?.art_image_path || undefined;

            if (!imageUrl) {
              const { data: assoc } = await supabase
                .from("release_songs")
                .select("release:releases(cover_art_path)")
                .eq("song_id", line.i!)
                .single();
              imageUrl =
                (assoc as { release?: { cover_art_path?: string | null } } | null)?.release
                  ?.cover_art_path || undefined;
            }
          }
        } else if (lineType === "ringtone") {
          const { data: song } = await supabase
            .from("songs")
            .select("title, art_image_path, ringtone_path_m4r, ringtone_path_mp3")
            .eq("id", line.i!)
            .single();
          itemTitle = song?.title ? `${song.title} — Ringtone` : "Your ringtone";
          imageUrl = song?.art_image_path || undefined;
          ringtonePlatforms = (["m4r", "mp3"] as RingtoneFormat[]).filter(
            (f) => (song as Record<string, unknown> | null)?.[`ringtone_path_${f}`],
          );
          if (!imageUrl) {
            const { data: assoc } = await supabase
              .from("release_songs")
              .select("release:releases(cover_art_path)")
              .eq("song_id", line.i!)
              .single();
            imageUrl =
              (assoc as { release?: { cover_art_path?: string | null } } | null)?.release
                ?.cover_art_path || undefined;
          }
        } else if (lineType === "release") {
          if (line.sk) {
            const { data: sku } = await supabase
              .from("release_skus")
              .select("id, release_id, format, fulfillment_method, download_path_mp3, download_path_flac, download_path_wav, stock")
              .eq("id", line.sk)
              .single();
            if (sku) {
              resolvedReleaseSkuId = sku.id;
              resolvedItemId = sku.release_id;
              if (sku.format !== "digital") {
                if (sku.fulfillment_method === "printify") sawPrintifyLine = true;
                else sawManualPhysicalLine = true;
              }
              // Effective paths: own for digital, sibling digital SKU for
              // physical (vinyl/cd/cassette) so the included digital copy ships.
              const { byReleaseSku } = await resolveSkuDownloadPaths(supabase, [sku.id], []);
              const paths = byReleaseSku.get(sku.id);
              availableFormats = (["mp3", "flac", "wav"] as FormatKey[]).filter(
                (f) => paths?.[f],
              );
              const { data: album } = await supabase
                .from("releases")
                .select("title, cover_art_path")
                .eq("id", sku.release_id)
                .single();
              itemTitle = album?.title || "Your album";
              imageUrl = album?.cover_art_path || undefined;
            }
          } else {
            // releases.download_path_* is GONE — legacy release lines can't
            // resolve download paths. Email will surface as-is with no links;
            // the buyer can use /music/recover for the order admin to manually
            // reissue. Flag loudly so we catch unexpected legacy lines.
            console.warn(
              "[stripe-webhook] Legacy release line with no sku_id; cannot resolve download paths (id=" +
                line.i +
                ")",
            );
            const { data: album } = await supabase
              .from("releases")
              .select("title, cover_art_path")
              .eq("id", line.i!)
              .single();
            itemTitle = album?.title || "Your album";
            imageUrl = album?.cover_art_path || undefined;
          }
        } else {
          let cfg: Record<string, unknown> | null = null;
          if (lineType === "merch" && typeof line.c === "number") {
            const cfgRaw = session.metadata?.[`cfg_${line.c}`];
            try { if (cfgRaw) cfg = JSON.parse(cfgRaw); } catch { /* ignore */ }
          }

          if (line.i) {
            const { data: product } = await supabase
              .from("merch")
              .select("title, image_url, fulfillment")
              .eq("id", line.i)
              .single();
            itemTitle = product?.title || (lineType === "art_original" ? "Original artwork" : "Merch");
            imageUrl = product?.image_url || undefined;
            if (cfg && typeof cfg.size === "string") {
              variantNote = `Size ${cfg.size}`;
            }
            // art_original is always hand-shipped; merch splits by fulfilment.
            if (lineType === "art_original") {
              sawManualPhysicalLine = true;
            } else if (typeof product?.fulfillment === "string" && product.fulfillment.startsWith("printify")) {
              sawPrintifyLine = true;
            } else {
              sawManualPhysicalLine = true;
            }
          } else {
            itemTitle = lineType === "art_original" ? "Original artwork" : "Merch";
            if (lineType === "art_original") sawManualPhysicalLine = true;
          }
        }

        let configSnapshot: Record<string, unknown> | null = null;
        if (lineType === "merch" && typeof line.c === "number") {
          const cfgRaw = session.metadata?.[`cfg_${line.c}`];
          try { if (cfgRaw) configSnapshot = JSON.parse(cfgRaw); } catch { /* ignore */ }
        }

        const lineTotal = stripeLineAmounts[idx] ?? 0;

        const { data: purchase, error: purchaseError } = await supabase
          .from("purchases")
          .insert({
            order_id: orderId,
            buyer_email: buyerEmail,
            audience_id: audienceId,
            item_type: lineType,
            item_id: resolvedItemId,
            release_sku_id: resolvedReleaseSkuId,
            song_sku_id: resolvedSongSkuId,
            sku_variant_id: resolvedVariantId,
            format,
            stripe_payment_intent_id: session.payment_intent || null,
            amount: lineTotal,
            unit_price: lineTotal,
            line_total: lineTotal,
            quantity: 1,
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

        // Stock decrement for physical SKUs. Idempotency: the entire path
        // is gated by the order-already-exists check at the top, so a Stripe
        // re-delivery short-circuits before we reach this line.
        if (
          (lineType === "release" || lineType === "song") &&
          (resolvedReleaseSkuId || resolvedSongSkuId)
        ) {
          try {
            if (resolvedVariantId) {
              const { data: v } = await supabase
                .from("sku_variants")
                .select("stock")
                .eq("id", resolvedVariantId)
                .single();
              if (v && v.stock !== null && v.stock !== undefined) {
                const next = v.stock - 1;
                await supabase
                  .from("sku_variants")
                  .update({ stock: next })
                  .eq("id", resolvedVariantId);
                if (next < 0) {
                  console.warn(
                    "[stripe-webhook] sku_variants.stock went negative for variant " +
                      resolvedVariantId,
                  );
                }
              }
            } else if (resolvedReleaseSkuId) {
              const { data: s } = await supabase
                .from("release_skus")
                .select("format, stock")
                .eq("id", resolvedReleaseSkuId)
                .single();
              if (s && s.format !== "digital" && s.stock !== null && s.stock !== undefined) {
                const next = s.stock - 1;
                await supabase
                  .from("release_skus")
                  .update({ stock: next })
                  .eq("id", resolvedReleaseSkuId);
                if (next < 0) {
                  console.warn(
                    "[stripe-webhook] release_skus.stock went negative for sku " +
                      resolvedReleaseSkuId,
                  );
                }
              }
            } else if (resolvedSongSkuId) {
              const { data: s } = await supabase
                .from("song_skus")
                .select("format, stock")
                .eq("id", resolvedSongSkuId)
                .single();
              if (s && s.format !== "digital" && s.stock !== null && s.stock !== undefined) {
                const next = s.stock - 1;
                await supabase
                  .from("song_skus")
                  .update({ stock: next })
                  .eq("id", resolvedSongSkuId);
                if (next < 0) {
                  console.warn(
                    "[stripe-webhook] song_skus.stock went negative for sku " +
                      resolvedSongSkuId,
                  );
                }
              }
            }
          } catch (e) {
            console.error("[stripe-webhook] stock decrement failed:", (e as Error).message);
          }
        }

        if ((lineType === "merch" || lineType === "art_original") && line.i) {
          const { error: rpcErr } = await supabase.rpc("increment_editions_sold", { p_product_id: line.i });
          if (rpcErr) console.error("[stripe-webhook] increment_editions_sold failed:", rpcErr.message);

          if (lineType === "art_original") {
            const { data: product } = await supabase
              .from("merch")
              .select("source_art_id")
              .eq("id", line.i)
              .single();
            if (product?.source_art_id) {
              await supabase.from("art_pieces").update({ sold: true }).eq("id", product.source_art_id);
            }
          }
        }

        let formatLinks: Array<{ format: FormatKey | RingtoneFormat; url: string }> | undefined;
        let fulfillmentNote: string | undefined;
        if (lineType === "merch" || lineType === "art_original") {
          fulfillmentNote = lineType === "art_original"
            ? "We'll be in touch shortly to arrange shipping for your original."
            : "Custom production takes 1–2 weeks. We'll email you when it ships.";
        } else {
          const tokenBase = `${SITE_URL}/api/download/${purchase.id}`;
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
        }

        emailItems.push({
          title: itemTitle,
          type: lineType,
          quantity: 1,
          lineTotal,
          variantNote,
          imageUrl,
          formatLinks,
          fulfillmentNote,
        });
      }

      // Write back the precise fulfilment split now that every line's source
      // is known. Drives the admin queue (push-to-Printify vs ship-yourself).
      if (sawPrintifyLine || sawManualPhysicalLine) {
        await supabase
          .from("orders")
          .update({
            has_printify_lines: sawPrintifyLine,
            has_manual_physical_lines: sawManualPhysicalLine,
          })
          .eq("id", orderId);
      }

      if (emailItems.length > 0) {
        const recoverUrl = `${SITE_URL}/music/recover`;
        const orderData = {
          orderNumber,
          orderId: orderId!,
          buyerEmail,
          buyerName: shipName,
          shipping: ship
            ? {
                name: shipName,
                line1: ship.line1 || null,
                line2: ship.line2 || null,
                city: ship.city || null,
                state: ship.state || null,
                postal_code: ship.postal_code || null,
                country: ship.country || null,
              }
            : null,
          subtotal,
          shippingCost: shipping,
          tax,
          total,
          items: emailItems,
          recoverUrl,
        };

        if (buyerEmail !== "unknown") {
          const customerHtml = buildOrderConfirmationHtml(orderData);
          const sent = await sendEmail({
            to: buyerEmail,
            subject: `Your order ${orderNumber} — chadlewine.com`,
            html: customerHtml,
            replyTo: ADMIN_NOTIFY_EMAIL,
          });
          if (!sent) {
            console.warn(`[stripe-webhook] Failed to send order confirmation to ${buyerEmail}`);
          }
        }

        const adminHtml = buildAdminOrderNotificationHtml({
          ...orderData,
          hasPhysical: hasPhysicalLines,
          hasDigital: hasDigitalLines,
        });
        const adminSent = await sendEmail({
          to: ADMIN_NOTIFY_EMAIL,
          subject: `New order ${orderNumber} · ${total ? `$${total.toFixed(2)} ` : ""}${buyerEmail}`,
          html: adminHtml,
          replyTo: buyerEmail !== "unknown" ? buyerEmail : undefined,
        });
        if (!adminSent) {
          console.warn(`[stripe-webhook] Failed to send admin notification for ${orderNumber}`);
        }
      }
    } else {
      // Patronage — donation flow.
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
