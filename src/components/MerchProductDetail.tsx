"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useCart } from "@/components/Cart";
import type { ProductVariant } from "@/components/MerchProductCard";

const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"];

interface Props {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  image_alt: string | null;
  tier: string;
  price: number | null;
  variants: ProductVariant[];
}

export function MerchProductDetail({
  id,
  title,
  description,
  image_url,
  image_alt,
  tier,
  price,
  variants,
}: Props) {
  const { add, open, hasItem } = useCart();
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "added">("idle");

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

  const colors = useMemo(
    () => Array.from(new Set(variants.map((v) => v.color).filter(Boolean) as string[])),
    [variants],
  );

  const variantForSize = (s: string | null): ProductVariant | null =>
    s ? variants.find((v) => v.size === s) || null : null;

  const lowestPrice =
    variants.length > 0 ? Math.min(...variants.map((v) => v.price_cents)) / 100 : price;
  const selectedVariant = variantForSize(selectedSize);
  const displayedPrice = selectedVariant
    ? selectedVariant.price_cents / 100
    : lowestPrice;
  const showFromLabel = !selectedVariant && sortedSizes.length > 1;

  const inCart = selectedVariant
    ? hasItem({
        type: "merch",
        id,
        format: null,
        product_config: { variant_id: selectedVariant.id },
      })
    : false;

  function handleBuy() {
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
    setStatus("added");
    open();
  }

  const buyLabel = !selectedVariant
    ? sortedSizes.length > 0 ? "Pick a size" : "Add to cart"
    : inCart || status === "added"
      ? "In cart — view"
      : "Add to cart";

  return (
    <div className="track-detail">
      <div className="track-detail__grid">
        {/* Left — Product image */}
        <div className="track-detail__art-col">
          {image_url && (
            <Image
              src={image_url}
              alt={image_alt || title}
              className="track-detail__cover"
              width={1200}
              height={1200}
              sizes="(max-width: 720px) 100vw, 600px"
              priority
            />
          )}
        </div>

        {/* Right — Product content */}
        <div className="track-detail__content-col">
          <h1 className="track-detail__title">{title}</h1>

          <div className="track-detail__info-bar" data-cols={colors.length > 0 ? 3 : 2}>
            <div className="track-detail__info-cell">
              <span className="track-detail__info-label">Tier</span>
              <span className="track-detail__info-value">{tier}</span>
            </div>
            {colors.length > 0 && (
              <div className="track-detail__info-cell">
                <span className="track-detail__info-label">Color</span>
                <span className="track-detail__info-value">{colors[0]}</span>
              </div>
            )}
            <div className="track-detail__info-cell">
              <span className="track-detail__info-label">Price</span>
              <span className="track-detail__info-value">
                {showFromLabel ? `from $${displayedPrice?.toFixed(2)}` : `$${displayedPrice?.toFixed(2)}`}
              </span>
            </div>
          </div>

          {sortedSizes.length > 0 && (
            <div className="merch-detail__size-row">
              <span className="merch-detail__size-label">Size</span>
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
                      onClick={() => { setSelectedSize(size); setStatus("idle"); }}
                      className={`merch-shop__size-btn${selected ? " merch-shop__size-btn--selected" : ""}`}
                    >
                      {size}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="track-detail__action-row">
            <div className="track-detail__actions">
              <button
                type="button"
                className={`track-detail__btn track-detail__btn--buy-album${inCart ? " track-detail__btn--in-cart" : ""}`}
                disabled={!selectedVariant && sortedSizes.length > 0}
                onClick={handleBuy}
              >
                {buyLabel}
              </button>
            </div>
          </div>

          {description && (
            <div className="track-detail__summary">
              <div className="track-detail__summary-text">{description}</div>
            </div>
          )}

          <p className="merch-detail__disclaimer">
            All sales final — no returns, exchanges, or refunds.
          </p>

          <p className="merch-detail__back">
            <Link href="/merch">← All merch</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
