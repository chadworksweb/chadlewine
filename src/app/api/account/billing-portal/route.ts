import { getCurrentSession } from "@/lib/account";
import { createAdminClient } from "@/lib/supabase-server";
import Stripe from "stripe";

// Creates a one-time Stripe Customer Portal session for the signed-in
// customer. Stripe-hosted page lets them manage saved payment methods,
// billing address, and view past invoices — no PCI exposure on our end.
export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("audience")
    .select("stripe_customer_id")
    .eq("id", session.audienceId)
    .single();

  if (!data?.stripe_customer_id) {
    return Response.json(
      { error: "No purchase history yet — make a purchase first." },
      { status: 404 }
    );
  }

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    return Response.json({ error: "Stripe not configured" }, { status: 500 });
  }
  const stripe = new Stripe(key);

  const origin = new URL(request.url).origin;
  try {
    const portal = await stripe.billingPortal.sessions.create({
      customer: data.stripe_customer_id,
      return_url: `${origin}/account`,
    });
    return Response.json({ url: portal.url });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Portal session failed" },
      { status: 500 }
    );
  }
}
