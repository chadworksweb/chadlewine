"use client";

import { useEffect, useState } from "react";
import { CrossSellCards, type CrossSellProductView } from "@/components/CrossSellCards";

// Post-purchase "complete the collection": cross-sells off what the order's
// session actually purchased. The order/purchases are written by the Stripe
// webhook, which may land a beat after redirect, so poll briefly then give up.
export function PostPurchaseCrossSell({ sessionId }: { sessionId: string | null }) {
  const [products, setProducts] = useState<CrossSellProductView[]>([]);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      tries++;
      try {
        const res = await fetch(`/api/cross-sell/from-session?session_id=${encodeURIComponent(sessionId!)}`);
        const d = await res.json();
        const list: CrossSellProductView[] = Array.isArray(d.products) ? d.products : [];
        if (cancelled) return;
        if (list.length > 0) { setProducts(list); return; }
      } catch {}
      // Webhook may not have written purchases yet; retry a few times.
      if (!cancelled && tries < 4) timer = setTimeout(poll, 1500);
    }
    poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [sessionId]);

  return <CrossSellCards products={products} variant="page" />;
}
