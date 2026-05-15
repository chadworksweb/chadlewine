"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const CART_KEY = "chadlewine_cart";

type CartItem = {
  type: "song" | "album" | "ringtone" | "merch" | "art_original";
  id: string;
  format?: "mp3" | "flac" | "wav" | null;
  product_config?: Record<string, unknown> | null;
};

// Lightweight resume-checkout page. Used as the `next=` target after a
// signed-out cart user picks "Sign in to your account" from the cart's auth
// gate. Reads the cart from localStorage, posts to /api/cart-checkout, and
// redirects to Stripe Checkout in one shot — so the user doesn't have to
// re-open the cart drawer and click "Proceed to Checkout" again after login.
export default function CheckoutResumePage() {
  const [error, setError] = useState<string | null>(null);
  const [emptyCart, setEmptyCart] = useState(false);

  useEffect(() => {
    let cancelled = false;
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
        setError(data.error || "Could not start checkout. Please try again.");
      } catch {
        if (!cancelled) setError("Could not start checkout. Please try again.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

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
