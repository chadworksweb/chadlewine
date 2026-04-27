/**
 * resend-order-emails.ts
 * Re-sends customer + admin notification emails for an existing order.
 *
 * Usage:
 *   npx tsx scripts/resend-order-emails.ts <order_number_or_uuid>
 *   npx tsx scripts/resend-order-emails.ts CL-1000
 */

import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import * as fs from "fs";
import * as path from "path";
import {
  sendEmail,
  buildOrderConfirmationHtml,
  buildAdminOrderNotificationHtml,
  type OrderEmailLine,
} from "../src/lib/email";

const envPath = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  envContent.split("\n").forEach((line) => {
    const [key, ...rest] = line.split("=");
    if (key && rest.length > 0) {
      process.env[key.trim()] = rest.join("=").trim();
    }
  });
}

const SITE_URL = process.env.SITE_URL || "https://staging.chadlewine.com";
const ADMIN_NOTIFY_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || "portal@chadlewine.com";

const arg = process.argv[2];
if (!arg) {
  console.error("Usage: npx tsx scripts/resend-order-emails.ts <order_number_or_uuid>");
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

async function main() {
  const isUuid = /^[0-9a-f-]{36}$/i.test(arg);
  const lookupCol = isUuid ? "id" : "order_number";

  const { data: order, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, status, buyer_email, buyer_name, ship_line1, ship_line2, ship_city, ship_state, ship_zip, ship_country, subtotal, shipping, tax, total, stripe_session_id, has_printify_lines, has_digital_lines",
    )
    .eq(lookupCol, arg)
    .single();

  if (error || !order) {
    console.error("Order not found:", arg, error?.message);
    process.exit(1);
  }

  const { data: purchases } = await supabase
    .from("purchases")
    .select("id, item_type, item_id, format, title_snapshot, product_config_snapshot, line_total, unit_price")
    .eq("order_id", order.id)
    .order("created_at", { ascending: true });

  if (!purchases || purchases.length === 0) {
    console.error("No purchase rows found for order");
    process.exit(1);
  }

  // Pull Stripe line item amounts as fallback for purchases that pre-date the
  // unit_price/line_total backfill.
  let stripeLineAmounts: number[] = [];
  if (order.stripe_session_id) {
    try {
      const li = await stripe.checkout.sessions.listLineItems(order.stripe_session_id, { limit: 25 });
      stripeLineAmounts = li.data.map((x) => (x.amount_total ?? 0) / 100);
    } catch (e) {
      console.warn("listLineItems failed:", (e as Error).message);
    }
  }

  const items: OrderEmailLine[] = await Promise.all(
    purchases.map(async (p, idx) => {
      const lineType = p.item_type as OrderEmailLine["type"];
      const cfg = p.product_config_snapshot as
        | { size?: string; tier?: string; source_type?: string; source_id?: string }
        | null;
      const variantNote = cfg?.size ? `Size ${cfg.size}` : undefined;
      const lineTotal = (p.line_total as number | null) ?? stripeLineAmounts[idx] ?? 0;

      let imageUrl: string | undefined;
      let formatLinks: OrderEmailLine["formatLinks"];
      let fulfillmentNote: string | undefined;

      if (lineType === "merch" || lineType === "art_original") {
        fulfillmentNote = lineType === "art_original"
          ? "We'll be in touch shortly to arrange shipping for your original."
          : "Custom production takes 1–2 weeks. We'll email you when it ships.";
        // Configurator merch (no product row) sources its art from the song/observation in cfg.
        if (cfg?.tier && cfg.source_type && cfg.source_id) {
          const table = cfg.source_type === "song" ? "songs" : "observations";
          const { data: src } = await supabase
            .from(table)
            .select("art_image_path")
            .eq("id", cfg.source_id)
            .single();
          imageUrl = (src as { art_image_path?: string } | null)?.art_image_path || undefined;
        } else if (p.item_id) {
          const { data: product } = await supabase
            .from("products")
            .select("image_url")
            .eq("id", p.item_id)
            .single();
          imageUrl = (product as { image_url?: string } | null)?.image_url || undefined;
        }
      } else if (lineType === "song" || lineType === "album") {
        const table = lineType === "song" ? "songs" : "albums";
        const imageCol = lineType === "song" ? "art_image_path" : "cover_art_path";
        const { data } = await supabase
          .from(table)
          .select(`${imageCol}, download_path_mp3, download_path_flac, download_path_wav, download_path`)
          .eq("id", p.item_id!)
          .single();
        imageUrl = (data as Record<string, unknown> | null)?.[imageCol] as string | undefined;
        if (!imageUrl && lineType === "song") {
          const { data: assoc } = await supabase
            .from("album_songs")
            .select("album:albums(cover_art_path)")
            .eq("song_id", p.item_id!)
            .single();
          imageUrl =
            (assoc as { album?: { cover_art_path?: string | null } } | null)?.album
              ?.cover_art_path || undefined;
        }
        const tokenBase = `${SITE_URL}/api/download/${p.id}`;
        const formats = (["mp3", "flac", "wav"] as const).filter(
          (f) => (data as Record<string, unknown> | null)?.[`download_path_${f}`],
        );
        if (p.format) {
          formatLinks = [{ format: p.format, url: tokenBase }];
        } else if (formats.length) {
          formatLinks = formats.map((f) => ({ format: f, url: `${tokenBase}?format=${f}` }));
        } else if ((data as { download_path?: string } | null)?.download_path) {
          formatLinks = [{ format: "mp3", url: tokenBase }];
        }
      } else if (lineType === "ringtone") {
        const { data } = await supabase
          .from("songs")
          .select("art_image_path, ringtone_path_m4r, ringtone_path_mp3")
          .eq("id", p.item_id!)
          .single();
        imageUrl = (data as { art_image_path?: string } | null)?.art_image_path || undefined;
        if (!imageUrl) {
          const { data: assoc } = await supabase
            .from("album_songs")
            .select("album:albums(cover_art_path)")
            .eq("song_id", p.item_id!)
            .single();
          imageUrl =
            (assoc as { album?: { cover_art_path?: string | null } } | null)?.album
              ?.cover_art_path || undefined;
        }
        const tokenBase = `${SITE_URL}/api/download/${p.id}`;
        const platforms = (["m4r", "mp3"] as const).filter(
          (f) => (data as Record<string, unknown> | null)?.[`ringtone_path_${f}`],
        );
        formatLinks = platforms.map((f) => ({ format: f, url: `${tokenBase}?format=${f}` }));
      }

      return {
        title: p.title_snapshot || "Item",
        type: lineType,
        quantity: 1,
        lineTotal,
        variantNote,
        imageUrl,
        formatLinks,
        fulfillmentNote,
      };
    }),
  );

  const orderData = {
    orderNumber: order.order_number,
    orderId: order.id,
    buyerEmail: order.buyer_email,
    buyerName: order.buyer_name,
    shipping: order.ship_line1
      ? {
          name: order.buyer_name,
          line1: order.ship_line1,
          line2: order.ship_line2,
          city: order.ship_city,
          state: order.ship_state,
          postal_code: order.ship_zip,
          country: order.ship_country,
        }
      : null,
    subtotal: Number(order.subtotal) || 0,
    shippingCost: Number(order.shipping) || 0,
    tax: Number(order.tax) || 0,
    total: Number(order.total) || 0,
    items,
    recoverUrl: `${SITE_URL}/music/recover`,
  };

  console.log(`Order ${order.order_number} · ${order.buyer_email} · $${orderData.total.toFixed(2)}`);
  console.log(`Items: ${items.length}`);

  if (order.buyer_email && order.buyer_email !== "unknown") {
    const customerHtml = buildOrderConfirmationHtml(orderData);
    const sent = await sendEmail({
      to: order.buyer_email,
      subject: `Your order ${order.order_number} — chadlewine.com`,
      html: customerHtml,
      replyTo: ADMIN_NOTIFY_EMAIL,
    });
    console.log(`Customer email → ${order.buyer_email}: ${sent ? "sent" : "FAILED"}`);
  } else {
    console.log("Customer email skipped — no buyer_email");
  }

  const adminHtml = buildAdminOrderNotificationHtml({
    ...orderData,
    hasPhysical: !!order.has_printify_lines,
    hasDigital: !!order.has_digital_lines,
  });
  const adminSent = await sendEmail({
    to: ADMIN_NOTIFY_EMAIL,
    subject: `New order ${order.order_number} · $${orderData.total.toFixed(2)} ${order.buyer_email}`,
    html: adminHtml,
    replyTo: order.buyer_email && order.buyer_email !== "unknown" ? order.buyer_email : undefined,
  });
  console.log(`Admin email → ${ADMIN_NOTIFY_EMAIL}: ${adminSent ? "sent" : "FAILED"}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
