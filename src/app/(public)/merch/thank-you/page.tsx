"use client";

import Link from "next/link";
import { Suspense, useEffect } from "react";

function MerchThankYouContent() {
  useEffect(() => {
    try {
      localStorage.removeItem("chadlewine_cart");
      window.dispatchEvent(new StorageEvent("storage", { key: "chadlewine_cart", newValue: null }));
    } catch {}
  }, []);

  return (
    <div id="page-thank-you" className="page-static">
      <h1 className="page-static__title">Thank You</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: "var(--space-lg)" }}>
        Your order is in. A receipt is on its way to your email.
      </p>
      <p style={{ color: "var(--text-tertiary)", fontSize: "var(--text-sm)", marginBottom: "var(--space-md)" }}>
        Custom production takes about 1–2 weeks. We&apos;ll email you again when it ships.
      </p>
      <p style={{ color: "var(--text-tertiary)", fontSize: "var(--text-xs)", marginBottom: "var(--space-xl)" }}>
        Questions? Reach us at{" "}
        <a href="mailto:portal@chadlewine.com" style={{ color: "var(--text-accent)" }}>
          portal@chadlewine.com
        </a>
        .
      </p>
      <Link href="/merch" style={{ color: "var(--text-accent)" }}>
        ← Back to Merch
      </Link>
    </div>
  );
}

export default function MerchThankYouPage() {
  return (
    <Suspense
      fallback={
        <div className="page-static">
          <p style={{ color: "var(--text-tertiary)" }}>Loading...</p>
        </div>
      }
    >
      <MerchThankYouContent />
    </Suspense>
  );
}
