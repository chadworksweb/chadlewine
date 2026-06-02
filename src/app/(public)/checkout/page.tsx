"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import CartEmbeddedCheckout from "@/components/CartEmbeddedCheckout";

const CART_KEY = "chadlewine_cart";

type CartItem = {
  type: "song" | "release" | "ringtone" | "merch" | "art_original";
  id: string;
  format?: "mp3" | "flac" | "wav" | null;
  product_config?: Record<string, unknown> | null;
  sku_id?: string | null;
  sku_variant_id?: string | null;
};

// Lightweight resume-checkout page. Used as the `next=` target after a
// signed-out cart user picks "Sign in to your account" from the cart's auth
// gate. Reads the cart from localStorage, posts to /api/cart-checkout, and
// redirects to Stripe Checkout in one shot — so the user doesn't have to
// re-open the cart drawer and click "Proceed to Checkout" again after login.
export default function CheckoutResumePage() {
  const [error, setError] = useState<string | null>(null);
  const [emptyCart, setEmptyCart] = useState(false);
  // Set for physical carts: Stripe embedded checkout mounts here so the buyer
  // can enter an address and we can compute shipping. Digital-only carts skip
  // straight to the hosted redirect.
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Recovery path: an abandoned-cart email links here with ?recover=<sessionId>.
    // Re-open the shopper's still-live session cross-device: hosted carts redirect
    // to Stripe's url, embedded (physical) carts re-mount with the client_secret.
    const recoverId = new URLSearchParams(window.location.search).get("recover");
    if (recoverId) {
      (async () => {
        try {
          const res = await fetch(`/api/checkout-recover?session=${encodeURIComponent(recoverId)}`);
          const data = await res.json();
          if (cancelled) return;
          if (data.url) {
            window.location.href = data.url;
            return;
          }
          if (data.client_secret || data.clientSecret) {
            setClientSecret(data.client_secret || data.clientSecret);
            return;
          }
          setError("This checkout link has expired. Your items may still be in your cart.");
        } catch {
          if (!cancelled) setError("This checkout link has expired. Your items may still be in your cart.");
        }
      })();
      return () => {
        cancelled = true;
      };
    }

    // Fast path: the cart drawer already created an embedded session and
    // stashed its secret. Mount directly (single use) -- no second API call.
    try {
      const stashed = sessionStorage.getItem("cl_checkout_secret");
      if (stashed) {
        sessionStorage.removeItem("cl_checkout_secret");
        // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-time handoff from the cart drawer
        setClientSecret(stashed);
        return;
      }
    } catch {}

    let items: CartItem[] = [];
    try {
      const raw = localStorage.getItem(CART_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) items = parsed;
      }
    } catch {}

    if (items.length === 0) {
      setEmptyCart(true);
      return;
    }

    (async () => {
      try {
        const res = await fetch("/api/cart-checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: items.map((i) => ({
              type: i.type,
              id: i.id,
              format: i.format,
              product_config: i.product_config ?? null,
              sku_id: i.sku_id ?? null,
              sku_variant_id: i.sku_variant_id ?? null,
            })),
            marketing_opt_in: true,
          }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (data.url) {
          window.location.href = data.url;
          return;
        }
        if (data.client_secret) {
          setClientSecret(data.client_secret);
          return;
        }
        setError(data.error || "Could not start checkout. Please try again.");
      } catch {
        if (!cancelled) setError("Could not start checkout. Please try again.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (clientSecret) {
    return (
      <div className="page-static">
        <h1 className="account-dashboard__title" style={{ marginBottom: "var(--space-lg)" }}>Checkout</h1>
        <CartEmbeddedCheckout clientSecret={clientSecret} />
      </div>
    );
  }

  return (
    <div className="page-static" style={{ maxWidth: 560, margin: "0 auto", padding: "var(--space-2xl) var(--space-md)" }}>
      <h1 className="account-dashboard__title">Sending you to checkout...</h1>
      {error && (
        <>
          <p style={{ marginTop: "var(--space-md)", color: "#f87171" }}>{error}</p>
          <p style={{ marginTop: "var(--space-md)" }}>
            <Link href="/music">Back to music</Link>
          </p>
        </>
      )}
      {emptyCart && !error && (
        <>
          <p style={{ marginTop: "var(--space-md)" }}>Your cart is empty.</p>
          <p style={{ marginTop: "var(--space-md)" }}>
            <Link href="/music">Browse music</Link>
          </p>
        </>
      )}
      {!error && !emptyCart && (
        <p style={{ marginTop: "var(--space-md)", color: "rgba(228,228,236,0.65)" }}>
          One moment — preparing your secure checkout session.
        </p>
      )}
    </div>
  );
}
