import Stripe from "stripe";

let _stripe: Stripe | null = null;

function getStripe() {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  }
  return _stripe;
}

/** Convert dollar amount to Stripe's required cents integer */
function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}

export async function createCheckoutSession(params: {
  amount: number;
  observation_id?: string;
  observation_title?: string;
  success_url: string;
  cancel_url: string;
}) {
  return getStripe().checkout.sessions.create({
    mode: "payment",
    submit_type: "donate",
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: params.observation_title
              ? `Patronage: ${params.observation_title}`
              : "Patronage",
          },
          unit_amount: toCents(params.amount),
        },
        quantity: 1,
      },
    ],
    metadata: params.observation_id
      ? { observation_id: params.observation_id }
      : {},
    success_url: params.success_url,
    cancel_url: params.cancel_url,
  });
}

export async function createCartCheckoutSession(params: {
  line_items: Array<{
    title: string;
    description?: string;
    price: number;
    cover_art_url?: string;
  }>;
  cart_items_metadata: string;
  // Extra Stripe metadata keys — used by configurator merch lines to carry
  // their full product_config (one cfg_<idx> key per configurator line).
  extra_metadata?: Record<string, string>;
  // True when the cart has any physical line; flips on Stripe shipping address
  // collection so the webhook + Printify push have an address.
  collect_shipping?: boolean;
  // Signed-in customer prefill. Pass `customer` when audience already has a
  // stripe_customer_id (future purchases attach to the same Customer record);
  // otherwise pass `customer_email` to prefill the field — Stripe still creates
  // a new Customer via customer_creation:'always'. These are mutually exclusive.
  customer?: string;
  customer_email?: string;
  success_url: string;
  cancel_url: string;
}) {
  const stripeLineItems = params.line_items.map((li) => {
    const images = li.cover_art_url ? [li.cover_art_url] : [];
    return {
      price_data: {
        currency: "usd",
        product_data: {
          name: li.title,
          ...(li.description ? { description: li.description } : {}),
          ...(images.length ? { images } : {}),
        },
        unit_amount: toCents(li.price),
      },
      // Digital + physical goods — quantity always 1; the same SKU can't be
      // bought twice in one cart (configurator items differ by config so they're
      // distinct lines).
      quantity: 1,
    };
  });

  // Mutually exclusive: passing `customer` means we already have a Stripe
  // Customer for this audience row — skip customer_creation in that case
  // because Stripe rejects the combination. Email prefill + customer_creation
  // is the path for first-time signed-in buyers.
  const customerParams: Pick<
    Stripe.Checkout.SessionCreateParams,
    "customer" | "customer_email" | "customer_creation"
  > = params.customer
    ? { customer: params.customer }
    : params.customer_email
      ? { customer_email: params.customer_email, customer_creation: "always" }
      : { customer_creation: "always" };

  return getStripe().checkout.sessions.create({
    mode: "payment",
    line_items: stripeLineItems,
    // Create or attach a persistent Stripe Customer so the buyer can be
    // routed through Billing Portal later (manage payment methods, view
    // past invoices, update billing address). Webhook saves the resulting
    // customer id onto the audience row.
    ...customerParams,
    metadata: {
      type: "cart",
      cart_items: params.cart_items_metadata,
      ...(params.extra_metadata || {}),
    },
    ...(params.collect_shipping
      ? {
          shipping_address_collection: {
            allowed_countries: ["US", "CA", "GB", "AU", "NZ", "IE"] as Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[],
          },
          phone_number_collection: { enabled: true },
        }
      : {}),
    success_url: params.success_url,
    cancel_url: params.cancel_url,
  });
}

export function verifyWebhookSignature(payload: string, signature: string) {
  return getStripe().webhooks.constructEvent(
    payload,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET!
  );
}

export async function listSessionLineItems(sessionId: string) {
  return getStripe().checkout.sessions.listLineItems(sessionId, { limit: 25 });
}
