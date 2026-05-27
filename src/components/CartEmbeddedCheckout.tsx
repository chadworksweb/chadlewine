"use client";

import { useEffect } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from "@stripe/react-stripe-js";

// Single Stripe.js instance for the page. Publishable key is public by design.
let stripePromise: Promise<Stripe | null> | null = null;
function getStripe() {
  if (!stripePromise) {
    stripePromise = loadStripe(
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "",
    );
  }
  return stripePromise;
}

// Stripe invokes this when the buyer enters/changes their shipping address.
// We recompute shipping server-side (Printify quote + manual rates) and write
// it back onto the session; Stripe then re-renders the rate + total.
async function onShippingDetailsChange(event: {
  checkoutSessionId: string;
  shippingDetails: unknown;
}): Promise<{ type: "accept" } | { type: "reject"; errorMessage?: string }> {
  try {
    const res = await fetch("/api/checkout/calculate-shipping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        checkout_session_id: event.checkoutSessionId,
        shipping_details: event.shippingDetails,
      }),
    });
    const data = await res.json();
    if (data?.type === "accept") return { type: "accept" };
    return {
      type: "reject",
      errorMessage: data?.errorMessage || "We couldn't calculate shipping for that address.",
    };
  } catch {
    return { type: "reject", errorMessage: "Network error calculating shipping. Please try again." };
  }
}

export default function CartEmbeddedCheckout({ clientSecret }: { clientSecret: string }) {
  // Stripe's embedded checkout autofocuses its first field on mount, which
  // scrolls the iframe into view and jumps the page down past our heading.
  // Hold the page at the top for a short window after mount so it loads
  // normally -- but release immediately if the buyer scrolls themselves.
  useEffect(() => {
    let raf = 0;
    let active = true;
    const start = Date.now();
    const release = () => {
      active = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("wheel", release);
      window.removeEventListener("touchmove", release);
      window.removeEventListener("keydown", release);
    };
    const pin = () => {
      if (!active) return;
      if (window.scrollY !== 0) window.scrollTo(0, 0);
      if (Date.now() - start < 1500) raf = requestAnimationFrame(pin);
      else release();
    };
    window.addEventListener("wheel", release, { passive: true });
    window.addEventListener("touchmove", release, { passive: true });
    window.addEventListener("keydown", release);
    raf = requestAnimationFrame(pin);
    return release;
  }, []);

  return (
    <div id="cl-embedded-checkout" style={{ padding: "var(--space-2xl) 0" }}>
      <EmbeddedCheckoutProvider
        stripe={getStripe()}
        options={{ clientSecret, onShippingDetailsChange }}
      >
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}
