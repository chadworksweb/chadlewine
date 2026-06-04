import { createCheckoutSession, createPatronageSubscriptionSession } from "@/lib/stripe";
import { getCurrentSession } from "@/lib/account";
import { createAdminClient } from "@/lib/supabase-server";

export async function POST(request: Request) {
  const body = await request.json();
  const { amount, observation_id, observation_title, interval } = body;

  if (!amount || amount < 1) {
    return Response.json({ error: "Minimum $1.00" }, { status: 400 });
  }

  const origin = request.headers.get("origin") || "https://chadlewine.com";

  try {
    // Monthly patronage -- a recurring subscription. No observation context
    // (it backs the whole body of work, not one piece). When signed in, prefill
    // the Stripe customer/email so the subscription attaches to the same record
    // their billing portal manages.
    if (interval === "month") {
      let customer: string | undefined;
      let customer_email: string | undefined;
      const session = await getCurrentSession();
      if (session) {
        const supabase = createAdminClient();
        const { data } = await supabase
          .from("audience")
          .select("email, stripe_customer_id")
          .eq("id", session.audienceId)
          .maybeSingle();
        if (data?.stripe_customer_id) customer = data.stripe_customer_id;
        else if (data?.email) customer_email = data.email;
      }

      const sub = await createPatronageSubscriptionSession({
        amount,
        customer,
        customer_email,
        success_url: `${origin}/patronage/thank-you?type=monthly`,
        cancel_url: `${origin}/patronage`,
      });
      if (!sub.url) {
        return Response.json({ error: "Checkout session created but no URL returned" }, { status: 500 });
      }
      return Response.json({ url: sub.url });
    }

    const session = await createCheckoutSession({
      amount,
      observation_id,
      observation_title,
      success_url: `${origin}/patronage/thank-you`,
      cancel_url: `${origin}${observation_id ? `/observations/${observation_id}` : "/"}`,
    });

    if (!session.url) {
      return Response.json({ error: "Checkout session created but no URL returned" }, { status: 500 });
    }
    return Response.json({ url: session.url });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
