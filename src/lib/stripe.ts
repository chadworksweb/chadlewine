// Stripe integration for patronage
// Install: npm install stripe
// Env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

async function stripeRequest(path: string, options: RequestInit = {}) {
  if (!STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY not set");

  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
      ...options.headers,
    },
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || `Stripe API error: ${res.status}`);
  }
  return data;
}

export async function createCheckoutSession(params: {
  amount_cents: number;
  observation_id?: string;
  observation_title?: string;
  success_url: string;
  cancel_url: string;
}) {
  const body = new URLSearchParams({
    "mode": "payment",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][product_data][name]": params.observation_title
      ? `Patronage: ${params.observation_title}`
      : "Patronage",
    "line_items[0][price_data][unit_amount]": params.amount_cents.toString(),
    "line_items[0][quantity]": "1",
    "success_url": params.success_url,
    "cancel_url": params.cancel_url,
    "submit_type": "donate",
  });

  if (params.observation_id) {
    body.append("metadata[observation_id]", params.observation_id);
  }

  return stripeRequest("/checkout/sessions", {
    method: "POST",
    body: body.toString(),
  });
}

// TODO: Install `stripe` npm package, then implement proper webhook verification:
// import Stripe from 'stripe';
// const stripe = new Stripe(STRIPE_SECRET_KEY);
// stripe.webhooks.constructEvent(payload, signature, STRIPE_WEBHOOK_SECRET);
