"use client";

import Link from "next/link";
import { Suspense, useEffect } from "react";

function CartThankYouContent() {
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
        Your purchase is confirmed. Download links are on their way to your email.
      </p>
      <p style={{ color: "var(--text-tertiary)", fontSize: "var(--text-xs)", marginBottom: "var(--space-xl)" }}>
        Don&apos;t see it within a minute? Recover all your downloads at{" "}
        <Link href="/music/recover" style={{ color: "var(--text-accent)" }}>/music/recover</Link>.
      </p>
      <Link href="/music" style={{ color: "var(--text-accent)" }}>
        Back to Music
      </Link>
    </div>
  );
}

export default function CartThankYouPage() {
  return (
    <Suspense fallback={<div className="page-static"><p style={{ color: "var(--text-tertiary)" }}>Loading...</p></div>}>
      <CartThankYouContent />
    </Suspense>
  );
}
