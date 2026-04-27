"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useCart } from "@/components/Cart";

const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"];

export interface ProductVariant {
  id: number;
  title: string;
  size: string | null;
  color: string | null;
  price_cents: number;
}

interface Props {
  id: string;
  slug: string | null;
  title: string;
  description: string | null;
  image_url: string | null;
  image_alt: string | null;
  tier: string;
  variants: ProductVariant[];
}

export function MerchProductCard({
  id,
  slug,
  title,
  description,
  image_url,
  image_alt,
  tier,
  variants,
}: Props) {
  const href = `/merch/${slug || id}`;
  const { add, open, hasItem } = useCart();

  const sortedSizes = useMemo(() => {
    const sizes = Array.from(new Set(variants.map((v) => v.size).filter(Boolean) as string[]));
    return sizes.sort((a, b) => {
      const ai = SIZE_ORDER.indexOf(a.toUpperCase());
      const bi = SIZE_ORDER.indexOf(b.toUpperCase());
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }, [variants]);

  const [selectedSize, setSelectedSize] = useState<string | null>(null);

  const variantForSize = (s: string | null): ProductVariant | null =>
    s ? variants.find((v) => v.size === s) || null : null;

  const lowestPrice = Math.min(...variants.map((v) => v.price_cents)) / 100;
  const selectedVariant = variantForSize(selectedSize);
  const displayedPrice = selectedVariant ? selectedVariant.price_cents / 100 : lowestPrice;
  const priceLabel = selectedVariant
    ? `$${displayedPrice.toFixed(2)}`
    : sortedSizes.length > 1
      ? `from $${lowestPrice.toFixed(2)}`
      : `$${lowestPrice.toFixed(2)}`;

  const inCart =
    selectedVariant
      ? hasItem({
          type: "merch",
          id,
          format: null,
          product_config: { variant_id: selectedVariant.id },
        })
      : false;

  function handleAdd() {
    if (!selectedVariant) return;
    if (inCart) {
      open();
      return;
    }
    add({
      type: "merch",
      id,
      title,
      slug: id,
      price: selectedVariant.price_cents / 100,
      format: null,
      cover_art_path: image_url,
      variant_label: selectedVariant.size ? `Size ${selectedVariant.size}` : selectedVariant.title,
      product_config: { variant_id: selectedVariant.id },
    });
    open();
  }

  return (
    <div className="merch-shop__card">
      {image_url && (
        <Link href={href}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image_url}
            alt={image_alt || title}
            className="merch-shop__card-img"
          />
        </Link>
      )}
      <div className="merch-shop__card-body">
        <div className="merch-shop__card-meta">
          <span className="merch-section__tier">{tier}</span>
        </div>
        <h3 className="merch-shop__card-title">
          <Link href={href} className="merch-shop__card-title-link">
            {title}
          </Link>
        </h3>
        {description && <p className="merch-shop__card-desc">{description}</p>}

        <p className="merch-shop__card-price" aria-live="polite">
          {priceLabel}
        </p>

        {sortedSizes.length > 0 && (
          <div className="merch-shop__sizes" role="radiogroup" aria-label="Size">
            {sortedSizes.map((size) => {
              const variant = variantForSize(size);
              if (!variant) return null;
              const selected = selectedSize === size;
              return (
                <button
                  key={size}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setSelectedSize(size)}
                  className={`merch-shop__size-btn${selected ? " merch-shop__size-btn--selected" : ""}`}
                >
                  {size}
                </button>
              );
            })}
          </div>
        )}

        <button
          type="button"
          className="merch-shop__add-btn"
          onClick={handleAdd}
          disabled={!selectedVariant}
        >
          {!selectedVariant
            ? sortedSizes.length > 0 ? "Pick a size" : "Add to cart"
            : inCart ? "In cart — view" : "Add to cart"}
        </button>
      </div>
    </div>
  );
}
