import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase-server";
import { retrieveSession, updateSessionShipping } from "@/lib/stripe";
import { calculateCartShipping, type CartLine, type ShippingAddress } from "@/lib/shipping";

// POST /api/checkout/calculate-shipping
// Stripe embedded-checkout onShippingDetailsChange handler. The client passes
// the checkout session id + the address the buyer just entered; we recompute
// shipping (Printify quote + manual rates) and write it back onto the session.
// Returns { type: "accept" } to render the rate, or { type: "reject", ... } to
// surface an error in the Stripe form.

type IncomingShippingDetails = {
  name?: string | null;
  address?: {
    line1?: string | null;
    line2?: string | null;
    city?: string | null;
    state?: string | null;
    postal_code?: string | null;
    country?: string | null;
  } | null;
};

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const sessionId = body?.checkout_session_id as string | undefined;
  const details = body?.shipping_details as IncomingShippingDetails | undefined;

  if (!sessionId || !details?.address) {
    return Response.json({ type: "reject", errorMessage: "Missing shipping details." });
  }

  let session: Stripe.Checkout.Session;
  try {
    session = await retrieveSession(sessionId);
  } catch {
    return Response.json({ type: "reject", errorMessage: "Checkout session not found." });
  }

  if (session.metadata?.type !== "cart") {
    return Response.json({ type: "reject", errorMessage: "Invalid checkout session." });
  }

  let cartLines: CartLine[] = [];
  try {
    const parsed = session.metadata?.cart_items ? JSON.parse(session.metadata.cart_items) : [];
    if (Array.isArray(parsed)) cartLines = parsed as CartLine[];
  } catch {
    return Response.json({ type: "reject", errorMessage: "Could not read your cart." });
  }

  const cfgMetadata: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(session.metadata || {})) {
    if (k.startsWith("cfg_")) cfgMetadata[k] = v as string;
  }

  const address: ShippingAddress = {
    name: details.name,
    line1: details.address?.line1,
    line2: details.address?.line2,
    city: details.address?.city,
    state: details.address?.state,
    postal_code: details.address?.postal_code,
    country: details.address?.country,
  };

  const supabase = createAdminClient();
  const quote = await calculateCartShipping(supabase, cartLines, address, cfgMetadata);

  if (quote.printifyError) {
    // Never silently ship Printify goods for free. Ask the buyer to retry
    // rather than locking in a $0 rate.
    return Response.json({
      type: "reject",
      errorMessage: "We couldn't calculate shipping for your address. Please try again in a moment.",
    });
  }

  const displayName =
    quote.amountCents === 0 ? "Free shipping" : "Shipping";

  try {
    await updateSessionShipping({
      sessionId,
      shippingDetails: {
        name: details.name || "Customer",
        address: {
          line1: details.address?.line1 || "",
          line2: details.address?.line2 || undefined,
          city: details.address?.city || "",
          state: details.address?.state || undefined,
          postal_code: details.address?.postal_code || "",
          country: details.address?.country || "US",
        },
      },
      amountCents: quote.amountCents,
      displayName,
    });
  } catch (e) {
    console.error("[calculate-shipping] session update failed:", (e as Error).message);
    return Response.json({ type: "reject", errorMessage: "Could not apply shipping. Please try again." });
  }

  return Response.json({ type: "accept" });
}
