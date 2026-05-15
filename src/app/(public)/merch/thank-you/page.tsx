"use client";

import Link from "next/link";
import posthog from "posthog-js";
import { Suspense, useEffect } from "react";

function MerchThankYouContent() {
  useEffect(() => {
    try {
      const raw = localStorage.getItem("chadlewine_cart");
      if (raw) {
        try {
          const items = JSON.parse(raw);
          if (Array.isArray(items) && items.length > 0) {
            const subtotal = items.reduce(
              (s: number, it: { price?: number }) => s + (Number(it.price) || 0),
              0,
            );
            posthog.capture("purchase_complete", {
              channel: "merch",
              item_count: items.length,
              subtotal,
              merch_ids: items.filter((it: { type?: string }) => it.type === "merch" || it.type === "art_original").map((it: { id: string }) => it.id),
              items: items.map((it: { type?: string; id?: string; slug?: string; title?: string; price?: number; variant_label?: string | null }) => ({
                type: it.type,
                id: it.id,
                slug: it.slug,
                title: it.title,
                price: it.price,
                variant: it.variant_label ?? null,
              })),
            });
          }
        } catch {}
      }
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
