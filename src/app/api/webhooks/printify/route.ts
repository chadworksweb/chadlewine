import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase-server";
import { publishingSucceeded, publishingFailed } from "@/lib/printify";
import { syncPrintifyProducts } from "@/lib/printify-sync";

// Printify ships HMAC-SHA256 over the raw body; secret is the value the user
// pastes in when configuring the webhook in Printify (saved as
// PRINTIFY_WEBHOOK_SECRET). If unset, we accept the event but log a warning so
// dev environments still work.
function verifySignature(rawBody: string, headerSig: string | null): boolean {
  const secret = process.env.PRINTIFY_WEBHOOK_SECRET;
  if (!secret) {
    console.warn("[printify-webhook] PRINTIFY_WEBHOOK_SECRET not set — accepting unverified event");
    return true;
  }
  if (!headerSig) return false;
  const provided = headerSig.startsWith("sha256=") ? headerSig.slice(7) : headerSig;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  if (provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(provided, "hex"), Buffer.from(expected, "hex"));
}

interface PrintifyShipment {
  carrier?: string;
  number?: string;
  url?: string;
  delivered_at?: string | null;
}

interface PrintifyEvent {
  id: string;
  type: string;
  created_at?: string;
  resource?: {
    id: string;
    type: string;
    data?: {
      shipments?: PrintifyShipment[];
      status?: string;
    };
  };
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const sig = request.headers.get("x-pfy-signature");

  if (!verifySignature(rawBody, sig)) {
    console.error("[printify-webhook] Signature verification failed");
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event: PrintifyEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const resourceId = event.resource?.id;
  if (!resourceId) {
    return Response.json({ received: true, ignored: "no resource.id" });
  }

  const supabase = createAdminClient();

  // Product publish flow — Printify locks the product as "Publishing" until we ack.
  if (event.type === "product:publish:started") {
    const siteUrl = process.env.SITE_URL || "https://chadlewine.com";
    try {
      const sync = await syncPrintifyProducts(supabase);
      if (!sync.ok) {
        await publishingFailed(resourceId, sync.error || "sync failed");
        return Response.json({ received: true, action: "publishing_failed", error: sync.error });
      }
      const { data: row } = await supabase
        .from("products")
        .select("slug")
        .eq("printify_product_id", resourceId)
        .maybeSingle();
      const slug = row?.slug || resourceId;
      await publishingSucceeded(resourceId, {
        id: resourceId,
        handle: `${siteUrl}/merch/${slug}`,
      });
      return Response.json({ received: true, action: "publishing_succeeded", slug });
    } catch (err) {
      const msg = (err as Error).message;
      console.error("[printify-webhook] publish ack failed:", msg);
      try {
        await publishingFailed(resourceId, msg);
      } catch {}
      return Response.json({ received: true, action: "publishing_failed", error: msg });
    }
  }

  // Locate the local order. If we don't have one yet (e.g. event arrives before
  // the createOrder response is persisted), ack and let a later event re-trigger.
  const { data: order } = await supabase
    .from("orders")
    .select("id, status")
    .eq("printify_order_id", resourceId)
    .maybeSingle();

  if (!order) {
    return Response.json({ received: true, ignored: "no local order" });
  }

  const shipment = event.resource?.data?.shipments?.[0];
  const printifyStatus = (event.resource?.data?.status || "").toLowerCase();
  const isCancelled = printifyStatus === "cancelled" || printifyStatus === "canceled";

  switch (event.type) {
    case "order:sent-to-production":
    case "order:created":
    case "order:updated": {
      if (isCancelled) {
        await supabase
          .from("orders")
          .update({ status: "cancelled" })
          .eq("id", order.id);
      } else if (order.status === "approved" || order.status === "pending_review") {
        await supabase
          .from("orders")
          .update({ status: "in_production" })
          .eq("id", order.id);
      }
      break;
    }
    case "order:shipment:created": {
      await supabase
        .from("orders")
        .update({
          status: "shipped",
          shipped_at: new Date().toISOString(),
          carrier: shipment?.carrier || null,
          tracking_number: shipment?.number || null,
          tracking_url: shipment?.url || null,
        })
        .eq("id", order.id);
      break;
    }
    case "order:shipment:delivered": {
      await supabase
        .from("orders")
        .update({
          status: "delivered",
          delivered_at: new Date().toISOString(),
        })
        .eq("id", order.id);
      break;
    }
    default:
      break;
  }

  return Response.json({ received: true });
}
