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

/** Monthly patronage -- a recurring subscription with no goods or rewards. One
   inline monthly price; Stripe Checkout collects the card + email and creates
   the Customer itself (subscription mode always does). The patrons ledger row
   is written by the invoice.paid webhook (first charge + every renewal), not
   here. The subscription carries a metadata.type so the webhook can tell a
   patronage renewal apart from any future subscription product. */
export async function createPatronageSubscriptionSession(params: {
  amount: number; // monthly amount in dollars
  customer?: string;
  customer_email?: string;
  success_url: string;
  cancel_url: string;
}) {
  const customerParams: Pick<
    Stripe.Checkout.SessionCreateParams,
    "customer" | "customer_email"
  > = params.customer
    ? { customer: params.customer }
    : params.customer_email
      ? { customer_email: params.customer_email }
      : {};

  return getStripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: { name: "Monthly Patronage" },
          unit_amount: toCents(params.amount),
          recurring: { interval: "month" },
        },
        quantity: 1,
      },
    ],
    metadata: { type: "patronage_subscription" },
    subscription_data: { metadata: { type: "patronage_subscription" } },
    ...customerParams,
    success_url: params.success_url,
    cancel_url: params.cancel_url,
  });
}

/** Sponsor a demo into production. One line item, payment mode, captured into
   balance immediately (funds are gated operationally via manual payouts -- there
   is no refund path). Account is required upstream, so we always have either a
   Stripe customer id or an email to attach. Sponsor details ride in metadata for
   the webhook to record the contribution + advance the funding total. */
export async function createSponsorCheckoutSession(params: {
  amount: number;
  song_id: string;
  sponsorship_id: string;
  audience_id: string;
  product_label: string; // e.g. "Sponsor: Boomerang (full production)"
  credit_name?: string;
  is_anonymous?: boolean;
  request_note?: string;
  customer?: string;
  customer_email?: string;
  success_url: string;
  cancel_url: string;
}) {
  const customerParams: Pick<
    Stripe.Checkout.SessionCreateParams,
    "customer" | "customer_email" | "customer_creation"
  > = params.customer
    ? { customer: params.customer }
    : { customer_email: params.customer_email, customer_creation: "always" };

  // Stripe caps metadata at 500 chars per key -- cap the free-text fields.
  const metadata: Record<string, string> = {
    type: "sponsor",
    song_id: params.song_id,
    sponsorship_id: params.sponsorship_id,
    audience_id: params.audience_id,
    is_anonymous: params.is_anonymous ? "true" : "false",
  };
  if (params.credit_name) metadata.credit_name = params.credit_name.slice(0, 120);
  if (params.request_note) metadata.request_note = params.request_note.slice(0, 480);

  return getStripe().checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: { name: params.product_label },
          unit_amount: toCents(params.amount),
        },
        quantity: 1,
      },
    ],
    ...customerParams,
    metadata,
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
  // Extra Stripe metadata keys — used by merch lines with a product_config
  // (curated-variant selection) to carry it (one cfg_<idx> key per such line).
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
  /** When set, attaches this Stripe Coupon id as a session-level discount.
     Stripe disallows `discounts` + `allow_promotion_codes:true` together —
     when present, the checkout's promo-code entry field is hidden. */
  discount_coupon_id?: string;
  /** Embedded UI mode. Required for carts with physical lines: only embedded
     checkout supports the address-driven dynamic shipping callback. When true,
     `return_url` is used (not success_url/cancel_url), an address-collection +
     placeholder shipping rate is attached, and the caller reads
     `session.client_secret` instead of `session.url`. */
  embedded?: boolean;
  return_url?: string;
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
      // bought twice in one cart (variant-configured items differ by config so
      // they're distinct lines).
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

  // Either let buyers type a promo code at Stripe, OR attach an ad-hoc
  // coupon for member-discount apply — never both (Stripe rejects the
  // combination).
  const discountParams: Pick<
    Stripe.Checkout.SessionCreateParams,
    "discounts" | "allow_promotion_codes"
  > = params.discount_coupon_id
    ? { discounts: [{ coupon: params.discount_coupon_id }] }
    : { allow_promotion_codes: true };

  // Shipping collection. For embedded carts we attach a $0 placeholder rate
  // and lock updates to server_only — the real rate is computed against the
  // entered address at the onShippingDetailsChange callback (calculate-shipping
  // route) and written back via updateSessionShipping().
  const shippingParams: Partial<Stripe.Checkout.SessionCreateParams> = params.collect_shipping
    ? {
        shipping_address_collection: {
          allowed_countries: ["US", "CA", "GB", "AU", "NZ", "IE"] as Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[],
        },
        phone_number_collection: { enabled: true },
        ...(params.embedded
          ? {
              permissions: { update_shipping_details: "server_only" },
              shipping_options: [
                {
                  shipping_rate_data: {
                    type: "fixed_amount",
                    fixed_amount: { amount: 0, currency: "usd" },
                    display_name: "Calculated from your address",
                  },
                },
              ],
            }
          : {}),
      }
    : {};

  // Embedded carts return a client_secret and redirect to return_url on
  // completion; hosted carts return a url and use success/cancel urls.
  const uiParams: Partial<Stripe.Checkout.SessionCreateParams> = params.embedded
    ? { ui_mode: "embedded_page", return_url: params.return_url }
    : { ui_mode: "hosted_page", success_url: params.success_url, cancel_url: params.cancel_url };

  return getStripe().checkout.sessions.create({
    mode: "payment",
    line_items: stripeLineItems,
    ...discountParams,
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
    ...shippingParams,
    ...uiParams,
  });
}

// Server-only shipping update for embedded checkout. Called from the
// onShippingDetailsChange handler after we compute the real rate. Writes the
// confirmed address back onto the session and replaces the placeholder rate.
export async function updateSessionShipping(params: {
  sessionId: string;
  shippingDetails: Stripe.Checkout.SessionUpdateParams.CollectedInformation.ShippingDetails;
  amountCents: number;
  displayName: string;
}) {
  return getStripe().checkout.sessions.update(params.sessionId, {
    collected_information: { shipping_details: params.shippingDetails },
    shipping_options: [
      {
        shipping_rate_data: {
          type: "fixed_amount",
          fixed_amount: { amount: params.amountCents, currency: "usd" },
          display_name: params.displayName,
        },
      },
    ],
  });
}

export function retrieveSession(sessionId: string) {
  return getStripe().checkout.sessions.retrieve(sessionId);
}

export function retrieveSubscription(subscriptionId: string) {
  return getStripe().subscriptions.retrieve(subscriptionId);
}

/** Active patronage subscription summary for a customer, or null when they have
   none. Authoritative live status -- this is the source of truth for whether a
   patron is still active (the patrons ledger only logs paid invoices and never
   learns about a cancellation). Used by the account dashboard. current_period_end
   moved from the subscription onto the item in newer API versions; read both. */
export async function getActivePatronage(customerId: string): Promise<{
  amount: number;
  interval: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  subscriptionId: string;
} | null> {
  const subs = await getStripe().subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 100,
  });
  const sub = subs.data.find(
    (s) =>
      s.metadata?.type === "patronage_subscription" &&
      (s.status === "active" || s.status === "trialing" || s.status === "past_due"),
  );
  if (!sub) return null;

  const item = sub.items.data[0];
  const cpeUnix =
    (item as { current_period_end?: number } | undefined)?.current_period_end ??
    (sub as unknown as { current_period_end?: number }).current_period_end ??
    null;

  return {
    amount: (item?.price?.unit_amount ?? 0) / 100,
    interval: item?.price?.recurring?.interval ?? "month",
    currentPeriodEnd: cpeUnix ? new Date(cpeUnix * 1000).toISOString() : null,
    cancelAtPeriodEnd: !!sub.cancel_at_period_end,
    subscriptionId: sub.id,
  };
}

export interface RecoverableCartSession {
  sessionId: string;
  email: string;
  /** Hosted (digital) sessions expose a payable url; embedded (physical) ones
     don't, so the caller resumes those via /checkout?recover=<sessionId>. */
  url: string | null;
  isEmbedded: boolean;
  amountTotalCents: number | null;
  createdMs: number;
}

/** List cart checkout sessions a shopper opened but never paid within a time
   window. Stripe cannot filter list() by metadata, so we page through `open`
   sessions in the created range and filter in code to our cart sessions that
   still have an unpaid status and a captured email. */
export async function listRecoverableCartSessions(params: {
  sinceMs: number; // oldest created time to include
  untilMs: number; // newest created time to include (i.e. now - delay)
}): Promise<RecoverableCartSession[]> {
  const stripe = getStripe();
  const out: RecoverableCartSession[] = [];

  for await (const s of stripe.checkout.sessions.list({
    status: "open",
    created: {
      gte: Math.floor(params.sinceMs / 1000),
      lte: Math.floor(params.untilMs / 1000),
    },
    limit: 100,
  })) {
    if (s.metadata?.type !== "cart") continue;
    if (s.payment_status !== "unpaid") continue;
    const email = s.customer_details?.email || s.customer_email || null;
    if (!email) continue;

    out.push({
      sessionId: s.id,
      email,
      url: s.url ?? null,
      // Hosted sessions carry a payable url; embedded (physical) ones don't.
      isEmbedded: !s.url,
      amountTotalCents: s.amount_total ?? s.amount_subtotal ?? null,
      createdMs: s.created * 1000,
    });
  }

  return out;
}

/** Resume payload for an embedded cart session (used by /checkout?recover=). */
export async function getResumableSession(
  sessionId: string
): Promise<{ clientSecret: string | null; url: string | null } | null> {
  const s = await getStripe().checkout.sessions.retrieve(sessionId);
  if (s.metadata?.type !== "cart") return null;
  if (s.status !== "open" || s.payment_status !== "unpaid") return null;
  return { clientSecret: s.client_secret ?? null, url: s.url ?? null };
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

/** Create a single-use percent-off Stripe Coupon + Promotion Code that expires
   `daysValid` days from now. Returns the promotion code (the string the buyer
   types into Stripe's promo field at checkout) plus both Stripe identifiers for
   our member_coupons row. `source` is stamped into Stripe metadata so grants
   from different funnels (cart thank-you, inquiry form, ...) stay traceable. */
export async function createStorePromoCode(params: {
  audienceId: string;
  percentOff: number;
  daysValid: number;
  source: string;
}): Promise<{
  code: string;
  stripeCouponId: string;
  stripePromotionCodeId: string;
  expiresAt: Date;
}> {
  const expiresAt = new Date(Date.now() + params.daysValid * 24 * 60 * 60 * 1000);
  const redeemBy = Math.floor(expiresAt.getTime() / 1000);

  const stripe = getStripe();
  const metadata = { audience_id: params.audienceId, source: params.source };

  const coupon = await stripe.coupons.create({
    percent_off: params.percentOff,
    duration: "once",
    redeem_by: redeemBy,
    max_redemptions: 1,
    metadata,
  });

  const promotionCode = await stripe.promotionCodes.create({
    promotion: { type: "coupon", coupon: coupon.id },
    expires_at: redeemBy,
    max_redemptions: 1,
    metadata,
  });

  return {
    code: promotionCode.code,
    stripeCouponId: coupon.id,
    stripePromotionCodeId: promotionCode.id,
    expiresAt,
  };
}
