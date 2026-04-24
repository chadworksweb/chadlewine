"use client";

import { useState } from "react";
import "./ArtDetail.css";

type Product = {
  id: string;
  title: string;
  price: number | null;
  variant_type: string | null;
  variant_label: string | null;
  edition_size: number;
  editions_sold: number;
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

export function ArtBuyPanel({ products }: { products: Product[]; artTitle: string }) {
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (products.length === 0) {
    return <div className="art-buy-panel art-buy-panel--empty">Not currently for sale.</div>;
  }

  const originals = products.filter((p) => p.variant_type === "original" || (!p.variant_type && p.edition_size <= 1));
  const prints = products.filter((p) => p.variant_type === "print");
  const other = products.filter((p) => !originals.includes(p) && !prints.includes(p));

  async function handleBuy(productId: string) {
    setBuyingId(productId);
    setError(null);
    try {
      const res = await fetch("/api/merch-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: productId }),
      });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      setError(data.error || "Checkout failed");
      setBuyingId(null);
    } catch {
      setError("Checkout failed");
      setBuyingId(null);
    }
  }

  function renderProduct(p: Product, kindLabel: string | null) {
    const avail = availability(p);
    const disabled = avail.soldOut || buyingId !== null;
    const label = p.variant_label || kindLabel || p.title;
    return (
      <div key={p.id} className="art-buy-variant">
        <div className="art-buy-variant__meta">
          <span className="art-buy-variant__label">{label}</span>
          {avail.label && <span className={`art-buy-variant__avail${avail.soldOut ? " is-sold" : ""}`}>{avail.label}</span>}
        </div>
        <button
          type="button"
          className="art-buy-variant__btn"
          onClick={() => handleBuy(p.id)}
          disabled={disabled}
        >
          {avail.soldOut ? "Unavailable" : buyingId === p.id ? "Redirecting…" : "Buy"}
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
      {error && <p className="art-buy-panel__error">{error}</p>}
    </div>
  );
}
