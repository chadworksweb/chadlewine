"use client";

import Link from "next/link";
import posthog from "posthog-js";
import { Suspense, useEffect } from "react";

function CartThankYouContent() {
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
              channel: "music",
              item_count: items.length,
              subtotal,
              song_ids: items.filter((it: { type?: string }) => it.type === "song").map((it: { id: string }) => it.id),
              album_ids: items.filter((it: { type?: string }) => it.type === "album").map((it: { id: string }) => it.id),
              ringtone_ids: items.filter((it: { type?: string }) => it.type === "ringtone").map((it: { id: string }) => it.id),
              items: items.map((it: { type?: string; id?: string; slug?: string; title?: string; price?: number; format?: string | null }) => ({
                type: it.type,
                id: it.id,
                slug: it.slug,
                title: it.title,
                price: it.price,
                format: it.format ?? null,
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
