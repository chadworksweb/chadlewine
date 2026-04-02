"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function CheckoutContent() {
  const params = useSearchParams();
  const success = params.get("success") === "true";

  if (!success) {
    return (
      <div id="page-merch-checkout" className="page-static">
        <h1 className="page-static__title">Checkout</h1>
        <p style={{ color: "var(--text-tertiary)", marginBottom: "var(--space-xl)" }}>
          Something went wrong. No purchase was completed.
        </p>
        <Link href="/merch" style={{ color: "var(--text-accent)" }}>
          Back to Merch
        </Link>
      </div>
    );
  }

  return (
    <div id="page-merch-checkout" className="page-static">
      <h1 className="page-static__title">You carry the citation now.</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: "var(--space-lg)", maxWidth: 480, lineHeight: "var(--leading-body)" }}>
        Your order is confirmed. Printify handles production and shipping &mdash; you&rsquo;ll get tracking info by email.
      </p>
      <p style={{ color: "var(--text-tertiary)", marginBottom: "var(--space-xl)", fontSize: "var(--text-sm)" }}>
        Want your design in the permanent catalog? After it arrives, submit it for review &mdash; if approved, you earn revenue share on every future sale.
      </p>
      <div style={{ display: "flex", gap: "var(--space-md)" }}>
        <Link href="/merch" style={{ color: "var(--text-accent)" }}>
          Configure another
        </Link>
        <Link href="/" style={{ color: "var(--text-secondary)" }}>
          Home
        </Link>
      </div>
    </div>
  );
}

export default function MerchCheckoutPage() {
  return (
    <Suspense fallback={<div className="page-static"><p style={{ color: "var(--text-tertiary)" }}>Loading...</p></div>}>
      <CheckoutContent />
    </Suspense>
  );
}
