"use client";

import { useCart } from "@/components/Cart";
import "./ArtDetail.css";

type Product = {
  id: string;
  title: string;
  price: number | null;
  variant_type: string | null;
  variant_label: string | null;
  edition_size: number;
  editions_sold: number;
  image_url?: string | null;
};

function availability(p: Product): { label: string; soldOut: boolean } {
  if (p.edition_size === 0) return { label: "", soldOut: false };
  if (p.edition_size === 1) {
    return p.editions_sold >= 1 ? { label: "SOLD", soldOut: true } : { label: "", soldOut: false };
  }
  const remaining = Math.max(0, p.edition_size - p.editions_sold);
  if (remaining === 0) return { label: "Sold out", soldOut: true };
  return { label: `${remaining} of ${p.edition_size} remaining`, soldOut: false };
}

export function ArtBuyPanel({ products, artTitle }: { products: Product[]; artTitle: string }) {
  const cart = useCart();

  if (products.length === 0) {
    return <div className="art-buy-panel art-buy-panel--empty">Not currently for sale.</div>;
  }

  const originals = products.filter((p) => p.variant_type === "original" || (!p.variant_type && p.edition_size <= 1));
  const prints = products.filter((p) => p.variant_type === "print");
  const other = products.filter((p) => !originals.includes(p) && !prints.includes(p));

  function renderProduct(p: Product, kindLabel: string | null) {
    const avail = availability(p);
    const lineType: "merch" | "art_original" =
      p.variant_type === "original" ? "art_original" : "merch";
    const inCart = cart.hasItem({ type: lineType, id: p.id, format: null, product_config: null });
    const disabled = avail.soldOut || inCart || !p.price;
    const label = p.variant_label || kindLabel || p.title;

    function handleAdd() {
      if (disabled || !p.price) return;
      cart.add({
        type: lineType,
        id: p.id,
        title: artTitle && lineType === "art_original" ? artTitle : p.title,
        slug: "",
        price: p.price,
        format: null,
        cover_art_path: p.image_url || null,
        variant_label: p.variant_label || kindLabel || null,
      });
    }

    return (
      <div key={p.id} className="art-buy-variant">
        <div className="art-buy-variant__meta">
          <span className="art-buy-variant__label">{label}</span>
          {avail.label && <span className={`art-buy-variant__avail${avail.soldOut ? " is-sold" : ""}`}>{avail.label}</span>}
        </div>
        <button
          type="button"
          className={`art-buy-variant__btn${inCart ? " art-buy-variant__btn--in-cart" : ""}`}
          onClick={handleAdd}
          disabled={disabled}
          aria-disabled={disabled}
        >
          {avail.soldOut
            ? "Unavailable"
            : inCart
              ? "Already in Cart"
              : "Add to Cart"}
        </button>
      </div>
    );
  }

  return (
    <div className="art-buy-panel">
      {originals.length > 0 && (
        <div className="art-buy-panel__group">
          <h3 className="art-buy-panel__heading">Original</h3>
          {originals.map((p) => renderProduct(p, "Original"))}
        </div>
      )}
      {prints.length > 0 && (
        <div className="art-buy-panel__group">
          <h3 className="art-buy-panel__heading">Prints</h3>
          {prints.map((p) => renderProduct(p, "Print"))}
        </div>
      )}
      {other.length > 0 && (
        <div className="art-buy-panel__group">
          {other.map((p) => renderProduct(p, null))}
        </div>
      )}
    </div>
  );
}
