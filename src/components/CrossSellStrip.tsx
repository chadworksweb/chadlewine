"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useCart } from "@/components/Cart";
import "./CrossSellStrip.css";

interface Variant {
  id: number;
  title: string;
  size: string | null;
  color: string | null;
  price_cents: number;
}
interface Suggestion {
  id: string;
  slug: string | null;
  title: string;
  image_url: string | null;
  image_alt: string | null;
  price: number | null;
  variants: Variant[] | null;
}

function fmt(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function CrossSellStrip({ variant = "drawer" }: { variant?: "drawer" | "page" }) {
  const { items, add, hasItem, close } = useCart();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  // Refetch only when the set of music items changes (merch adds don't alter
  // the suggestion source -- they only filter the displayed list below).
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed on musicKey only
  }, [musicKey]);

  // Drop anything already in the cart (e.g. a single-variant item just added).
  const shown = suggestions.filter(
    (p) => !hasItem({ type: "merch", id: p.id, format: null, product_config: variantConfig(p) }),
  );

  if (shown.length === 0) return null;

  function variantConfig(p: Suggestion): Record<string, unknown> | null {
    const v = p.variants && p.variants.length === 1 ? p.variants[0] : null;
    return v ? { variant_id: v.id } : null;
  }

  function addSingle(p: Suggestion) {
    const v = p.variants?.[0];
    if (!v) return;
    add({
      type: "merch",
      id: p.id,
      title: p.title,
      slug: p.slug || p.id,
      price: v.price_cents / 100,
      format: null,
      cover_art_path: p.image_url,
      variant_label: v.size ? `Size ${v.size}` : v.title,
      product_config: { variant_id: v.id },
    });
  }

  return (
    <section className={`cross-sell cross-sell--${variant}`} aria-label="You might also like">
      <h3 className="cross-sell__heading">Complete the collection</h3>
      <ul className="cross-sell__list">
        {shown.map((p) => {
          const single = p.variants && p.variants.length === 1;
          const lowest = p.variants && p.variants.length > 0
            ? Math.min(...p.variants.map((v) => v.price_cents)) / 100
            : p.price ?? 0;
          return (
            <li key={p.id} className="cross-sell__card">
              <Link href={`/merch/${p.slug || p.id}`} className="cross-sell__thumb-link" onClick={close}>
                {p.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.image_url} alt={p.image_alt || p.title} className="cross-sell__thumb" />
                ) : (
                  <span className="cross-sell__thumb cross-sell__thumb--empty" />
                )}
              </Link>
              <div className="cross-sell__meta">
                <Link href={`/merch/${p.slug || p.id}`} className="cross-sell__title" onClick={close}>
                  {p.title}
                </Link>
                <span className="cross-sell__price">
                  {!single && p.variants && p.variants.length > 1 ? "from " : ""}{fmt(lowest)}
                </span>
              </div>
              {single ? (
                <button type="button" className="cross-sell__add" onClick={() => addSingle(p)}>
                  Add
                </button>
              ) : (
                <Link href={`/merch/${p.slug || p.id}`} className="cross-sell__add cross-sell__add--link" onClick={close}>
                  Options
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
