"use client";

import Link from "next/link";

export default function MerchCheckoutPage() {
  return (
    <div id="page-merch-checkout" className="page-static">
      <h1 className="page-static__title">Checkout</h1>
      <p style={{ color: "var(--text-tertiary)", marginBottom: "var(--space-xl)" }}>
        Merch checkout coming soon.
      </p>
      <Link href="/" style={{ color: "var(--text-accent)" }}>
        Back Home
      </Link>
    </div>
  );
}
