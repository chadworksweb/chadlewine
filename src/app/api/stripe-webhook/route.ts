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

    if (itemType && itemId && ["song", "album"].includes(itemType)) {
      // Music purchase
      const { error: purchaseError } = await supabase.from("purchases").insert({
        buyer_email: session.customer_details?.email || "unknown",
        item_type: itemType,
        item_id: itemId,
        stripe_payment_intent_id: session.payment_intent || null,
        amount: (session.amount_total || 0) / 100,
      });

      if (purchaseError) {
        console.error("[stripe-webhook] Failed to insert purchase:", purchaseError.message);
        return Response.json({ error: "Database insert failed" }, { status: 500 });
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
