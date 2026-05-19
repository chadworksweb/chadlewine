import { createAdminClient } from "@/lib/supabase-server";
import { sendEmail } from "@/lib/email";

const ALLOWED_STATUSES = [
  "pending_review",
  "approved",
  "in_production",
  "shipped",
  "delivered",
  "completed",
  "cancelled",
  "refunded",
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Orders have no slug, but order_number ("CL-1042") is the friendly handle.
// Accept either a UUID or the order_number; resolve to UUID for downstream use.
async function resolveOrderId(
  supabase: ReturnType<typeof createAdminClient>,
  idOrNumber: string,
): Promise<string | null> {
  if (UUID_RE.test(idOrNumber)) return idOrNumber;
  const { data } = await supabase.from("orders").select("id").eq("order_number", idOrNumber).maybeSingle();
  return data?.id ?? null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: idOrNumber } = await params;
  const supabase = createAdminClient();
  const field = UUID_RE.test(idOrNumber) ? "id" : "order_number";

  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select("*")
    .eq(field, idOrNumber)
    .single();

  if (orderErr || !order) {
    return Response.json({ error: "Order not found" }, { status: 404 });
  }
  const id = order.id as string;

  const { data: linesRaw } = await supabase
    .from("purchases")
    .select("id, item_type, item_id, format, title_snapshot, product_config_snapshot, line_total, unit_price, printify_line_item_id, created_at")
    .eq("order_id", id)
    .order("created_at", { ascending: true });

  const lines = linesRaw || [];

  // Fetch product/song/album metadata for thumbnails + Printify pre-fill.
  const productIds = Array.from(
    new Set(
      lines
        .filter((l) => (l.item_type === "merch" || l.item_type === "art_original") && l.item_id)
        .map((l) => l.item_id as string),
    ),
  );
  const songIds = Array.from(
    new Set(
      lines
        .filter((l) => (l.item_type === "song" || l.item_type === "ringtone") && l.item_id)
        .map((l) => l.item_id as string),
    ),
  );
  const albumIds = Array.from(
    new Set(
      lines
        .filter((l) => l.item_type === "release" && l.item_id)
        .map((l) => l.item_id as string),
    ),
  );

  let productMap: Record<string, {
    printify_product_id: string | null;
    fulfillment: string | null;
    title: string | null;
    image_url: string | null;
  }> = {};
  if (productIds.length) {
    const { data: products } = await supabase
      .from("products")
      .select("id, printify_product_id, fulfillment, title, image_url")
      .in("id", productIds);
    productMap = (products || []).reduce<typeof productMap>((acc, p) => {
      acc[p.id] = {
        printify_product_id: p.printify_product_id,
        fulfillment: p.fulfillment,
        title: p.title,
        image_url: p.image_url,
      };
      return acc;
    }, {});
  }

  let songMap: Record<string, { art_image_path: string | null }> = {};
  if (songIds.length) {
    const { data: songs } = await supabase
      .from("songs")
      .select("id, art_image_path")
      .in("id", songIds);
    songMap = (songs || []).reduce<typeof songMap>((acc, s) => {
      acc[s.id] = { art_image_path: s.art_image_path };
      return acc;
    }, {});
  }

  let albumMap: Record<string, { cover_art_path: string | null }> = {};
  if (albumIds.length) {
    const { data: albums } = await supabase
      .from("releases")
      .select("id, cover_art_path")
      .in("id", albumIds);
    albumMap = (albums || []).reduce<typeof albumMap>((acc, a) => {
      acc[a.id] = { cover_art_path: a.cover_art_path };
      return acc;
    }, {});
  }

  const enriched = lines.map((l) => {
    let image_url: string | null = null;
    if (l.item_id) {
      if (productMap[l.item_id]) image_url = productMap[l.item_id].image_url;
      else if (songMap[l.item_id]) image_url = songMap[l.item_id].art_image_path;
      else if (albumMap[l.item_id]) image_url = albumMap[l.item_id].cover_art_path;
    }
    return {
      ...l,
      image_url,
      product:
        l.item_id && productMap[l.item_id]
          ? {
              printify_product_id: productMap[l.item_id].printify_product_id,
              fulfillment: productMap[l.item_id].fulfillment,
              title: productMap[l.item_id].title,
            }
          : null,
    };
  });

  return Response.json({ order, lines: enriched });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: idOrNumber } = await params;
  const body = await request.json().catch(() => null);
  const status = body?.status;
  const notes = body?.notes;

  if (status && !ALLOWED_STATUSES.includes(status)) {
    return Response.json(
      { error: `Invalid status. Allowed: ${ALLOWED_STATUSES.join(", ")}` },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();
  const id = await resolveOrderId(supabase, idOrNumber);
  if (!id) return Response.json({ error: "Order not found" }, { status: 404 });

  const update: Record<string, unknown> = {};
  if (status) {
    update.status = status;
    if (status === "refunded") update.refunded_at = new Date().toISOString();
    if (status === "shipped") update.shipped_at = new Date().toISOString();
    if (status === "delivered") update.delivered_at = new Date().toISOString();
  }
  if (typeof notes === "string") update.notes = notes;

  const { data: order, error } = await supabase
    .from("orders")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error || !order) {
    return Response.json({ error: error?.message || "Update failed" }, { status: 500 });
  }

  if (status === "refunded" && order.buyer_email) {
    const html = buildRefundEmailHtml(order);
    await sendEmail({
      to: order.buyer_email,
      subject: `Your order ${order.order_number} has been refunded`,
      html,
    });
  }

  return Response.json({ order });
}

function escapeHtml(s: string | null): string {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildRefundEmailHtml(order: {
  order_number: string;
  buyer_name: string | null;
  buyer_email: string;
  total: number;
}): string {
  const name = order.buyer_name?.split(" ")[0] || "there";
  const total = `$${Number(order.total).toFixed(2)}`;
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; background:#0a0a14; color:#e0e0e8; padding:40px 20px;">
<div style="max-width:560px;margin:0 auto;">
  <h2 style="color:#fff;margin:0 0 16px;">Your order has been refunded</h2>
  <p style="line-height:1.6;">Hi ${escapeHtml(name)}, your order <strong>${escapeHtml(order.order_number)}</strong> has been refunded.</p>
  <p style="line-height:1.6;">The refund of <strong>${total}</strong> will be returned to your original payment method. Please allow a few business days for it to appear on your statement.</p>
  <p style="font-size:11px;color:#606070;margin-top:32px;line-height:1.6;">Customer support: <a href="mailto:portal@chadlewine.com" style="color:#8b9cf7;">portal@chadlewine.com</a></p>
</div>
</body></html>`;
}
