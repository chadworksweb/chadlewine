"use client";

import Link from "next/link";
import { useCart } from "@/components/Cart";
import "./CrossSellStrip.css";

export interface CrossSellVariant {
  id: number;
  title: string;
  size: string | null;
  color: string | null;
  price_cents: number;
}
export interface CrossSellProductView {
  id: string;
  slug: string | null;
  title: string;
  image_url: string | null;
  image_alt: string | null;
  price: number | null;
  variants: CrossSellVariant[] | null;
}

function fmt(n: number): string {
  return `$${n.toFixed(2)}`;
}

// Presentational card grid shared by the cart-drawer cross-sell and the
// post-purchase "complete the collection" strip. Single-variant products
// one-click-add; multi-variant link to the product page to pick options.
export function CrossSellCards({
  products,
  heading = "Complete the collection",
  variant = "drawer",
  onNavigate,
}: {
  products: CrossSellProductView[];
  heading?: string;
  variant?: "drawer" | "page";
  onNavigate?: () => void;
}) {
  const { add } = useCart();
  if (products.length === 0) return null;

  function addSingle(p: CrossSellProductView) {
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
    <section className={`cross-sell cross-sell--${variant}`} aria-label={heading}>
      <h3 className="cross-sell__heading">{heading}</h3>
      <ul className="cross-sell__list">
        {products.map((p) => {
          const single = p.variants && p.variants.length === 1;
          const lowest = p.variants && p.variants.length > 0
            ? Math.min(...p.variants.map((v) => v.price_cents)) / 100
            : p.price ?? 0;
          const href = `/merch/${p.slug || p.id}`;
          return (
            <li key={p.id} className="cross-sell__card">
              <Link href={href} className="cross-sell__thumb-link" onClick={onNavigate}>
                {p.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.image_url} alt={p.image_alt || p.title} className="cross-sell__thumb" />
                ) : (
                  <span className="cross-sell__thumb cross-sell__thumb--empty" />
                )}
              </Link>
              <div className="cross-sell__meta">
                <Link href={href} className="cross-sell__title" onClick={onNavigate}>{p.title}</Link>
                <span className="cross-sell__price">
                  {!single && p.variants && p.variants.length > 1 ? "from " : ""}{fmt(lowest)}
                </span>
              </div>
              {single ? (
                <button type="button" className="cross-sell__add" onClick={() => addSingle(p)}>Add</button>
              ) : (
                <Link href={href} className="cross-sell__add cross-sell__add--link" onClick={onNavigate}>Options</Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
