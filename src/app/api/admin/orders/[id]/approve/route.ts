import { createAdminClient } from "@/lib/supabase-server";
import { createOrder, sendOrderToProduction, type PrintifyOrderLineItem } from "@/lib/printify";

interface ApproveBody {
  // 'approve' transitions the order out of pending_review. 'reject' cancels it.
  decision: "approve" | "reject";
  // When provided alongside 'approve', the order is pushed to Printify in the
  // same call. Admin maps each Printify-fulfilled line to a {product_id,
  // variant_id, quantity} triple. Lines not in this list aren't sent.
  printify_line_items?: PrintifyOrderLineItem[];
  // Default 1 (standard). Set to 2 for express, etc. — see Printify shipping API.
  shipping_method?: number;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as ApproveBody | null;

  if (!body || (body.decision !== "approve" && body.decision !== "reject")) {
    return Response.json({ error: "decision must be 'approve' or 'reject'" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select("*")
    .eq("id", id)
    .single();

  if (orderErr || !order) {
    return Response.json({ error: "Order not found" }, { status: 404 });
  }
  if (order.status !== "pending_review" && order.status !== "approved") {
    return Response.json(
      { error: `Order is not reviewable (status: ${order.status})` },
      { status: 409 },
    );
  }

  const nowIso = new Date().toISOString();

  if (body.decision === "reject") {
    await supabase
      .from("orders")
      .update({ status: "cancelled", reviewed_at: nowIso })
      .eq("id", id);
    return Response.json({ ok: true, status: "cancelled" });
  }

  // Approve path. If admin supplied Printify line mappings, push now;
  // otherwise just flip status to 'approved' so it's queued for a later push.
  if (!body.printify_line_items || body.printify_line_items.length === 0) {
    await supabase
      .from("orders")
      .update({ status: "approved", reviewed_at: nowIso })
      .eq("id", id);
    return Response.json({ ok: true, status: "approved" });
  }

  // Push to Printify
  if (!order.ship_line1 || !order.ship_city || !order.ship_country) {
    return Response.json(
      { error: "Order is missing shipping address — cannot push to Printify" },
      { status: 400 },
    );
  }

  const [firstName, ...rest] = (order.buyer_name || "").trim().split(/\s+/);
  const lastName = rest.join(" ") || "—";

  try {
    const printifyResp = await createOrder({
      external_id: order.order_number,
      label: order.order_number,
      line_items: body.printify_line_items,
      shipping_method: body.shipping_method || 1,
      send_shipping_notification: false,
      address_to: {
        first_name: firstName || "Customer",
        last_name: lastName,
        email: order.buyer_email,
        country: order.ship_country,
        region: order.ship_state || "",
        address1: order.ship_line1,
        address2: order.ship_line2 || undefined,
        city: order.ship_city,
        zip: order.ship_zip || "",
      },
    });

    // Move the order out of "draft" so Printify actually fulfills it. Failure
    // here isn't fatal — admin can retry from the Printify dashboard.
    try {
      await sendOrderToProduction(printifyResp.id);
    } catch (sendErr) {
      console.warn("[orders/approve] sendOrderToProduction failed:", (sendErr as Error).message);
    }

    await supabase
      .from("orders")
      .update({
        status: "in_production",
        reviewed_at: nowIso,
        pushed_to_printify_at: nowIso,
        printify_order_id: printifyResp.id,
      })
      .eq("id", id);

    return Response.json({ ok: true, status: "in_production", printify_order_id: printifyResp.id });
  } catch (err) {
    console.error("[orders/approve] Printify createOrder failed:", (err as Error).message);
    return Response.json(
      { error: `Printify rejected the order: ${(err as Error).message}` },
      { status: 502 },
    );
  }
}
