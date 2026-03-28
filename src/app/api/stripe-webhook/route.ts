import { createAdminClient } from "@/lib/supabase-server";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return Response.json({ error: "Missing signature" }, { status: 400 });
  }

  const payload = await request.text();

  // TODO: Verify webhook signature with Stripe SDK
  // For now, parse the event directly
  let event;
  try {
    event = JSON.parse(payload);
  } catch {
    return Response.json({ error: "Invalid payload" }, { status: 400 });
  }

  const supabase = createAdminClient();

  if (event.type === "checkout.session.completed") {
    const session = event.data?.object;
    if (!session) {
      return Response.json({ error: "Missing session data" }, { status: 400 });
    }

    const observationId = session.metadata?.observation_id || null;

    const { error: insertError } = await supabase.from("patrons").insert({
      email: session.customer_details?.email || null,
      stripe_payment_intent_id: session.payment_intent || null,
      amount_cents: session.amount_total || 0,
      is_recurring: false,
      source_observation_id: observationId,
    });

    if (insertError) {
      console.error("[stripe-webhook] Failed to insert patron:", insertError.message);
      return Response.json({ error: "Database insert failed" }, { status: 500 });
    }
  }

  return Response.json({ received: true });
}
