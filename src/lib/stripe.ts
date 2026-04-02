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

export async function createMusicCheckoutSession(params: {
  type: "song" | "album";
  item_id: string;
  title: string;
  album_title?: string;
  price: number;
  cover_art_url?: string;
  success_url: string;
  cancel_url: string;
}) {
  const images = params.cover_art_url ? [params.cover_art_url] : [];
  const description =
    params.type === "song" && params.album_title
      ? `From ${params.album_title}`
      : undefined;

  return getStripe().checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: params.title,
            ...(description ? { description } : {}),
            ...(images.length ? { images } : {}),
          },
          unit_amount: toCents(params.price),
        },
        quantity: 1,
      },
    ],
    metadata: {
      type: params.type,
      item_id: params.item_id,
    },
    success_url: params.success_url,
    cancel_url: params.cancel_url,
  });
}

export async function createMerchCheckoutSession(params: {
  product_config: Record<string, unknown>;
  product_id?: string;
  title: string;
  price: number;
  image_url?: string;
  success_url: string;
  cancel_url: string;
}) {
  const images = params.image_url ? [params.image_url] : [];

  return getStripe().checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: params.title,
            ...(images.length ? { images } : {}),
          },
          unit_amount: toCents(params.price),
        },
        quantity: 1,
      },
    ],
    metadata: {
      type: "merch",
      product_id: params.product_id || "",
      product_config: JSON.stringify(params.product_config),
    },
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
