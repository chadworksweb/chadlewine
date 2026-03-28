import { createCheckoutSession } from "@/lib/stripe";

export async function POST(request: Request) {
  const body = await request.json();
  const { amount, observation_id, observation_title } = body;

  if (!amount || amount < 100) {
    return Response.json({ error: "Minimum $1.00" }, { status: 400 });
  }

  try {
    const origin = request.headers.get("origin") || "https://chadlewine.com";
    const session = await createCheckoutSession({
      amount_cents: amount,
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
