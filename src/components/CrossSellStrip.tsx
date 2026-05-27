"use client";

import { useEffect, useMemo, useState } from "react";
import { useCart } from "@/components/Cart";
import { CrossSellCards, type CrossSellProductView } from "@/components/CrossSellCards";

// Cart-drawer cross-sell: suggests merch related to the music in the cart.
export function CrossSellStrip({ variant = "drawer" }: { variant?: "drawer" | "page" }) {
  const { items, hasItem, close } = useCart();
  const [suggestions, setSuggestions] = useState<CrossSellProductView[]>([]);

  const musicKey = useMemo(
    () =>
      items
        .filter((i) => i.type === "release" || i.type === "song" || i.type === "ringtone")
        .map((i) => `${i.type}:${i.id}`)
        .sort()
        .join("|"),
    [items],
  );

  useEffect(() => {
    if (!musicKey) { setSuggestions([]); return; }
    let cancelled = false;
    fetch("/api/cross-sell", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: items.map((i) => ({ type: i.type, id: i.id })) }),
    })
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setSuggestions(Array.isArray(d.products) ? d.products : []); })
      .catch(() => { if (!cancelled) setSuggestions([]); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on musicKey only
  }, [musicKey]);

  // Drop anything already in the cart (e.g. a single-variant item just added).
  const shown = suggestions.filter((p) => {
    const single = p.variants && p.variants.length === 1;
    return !hasItem({
      type: "merch",
      id: p.id,
      format: null,
      product_config: single ? { variant_id: p.variants![0].id } : null,
    });
  });

  return <CrossSellCards products={shown} variant={variant} onNavigate={close} />;
}
