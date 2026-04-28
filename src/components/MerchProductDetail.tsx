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
  image_urls?: string[];
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
  image_urls,
  image_alt,
  price,
  variants,
}: Props) {
  const { add, open, hasItem } = useCart();
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "added">("idle");

  // Build the gallery: hero first, then any extras from image_urls (deduped).
  // If only the hero is present, the thumbnail strip stays hidden.
  const gallery = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    if (image_url) {
      seen.add(image_url);
      out.push(image_url);
    }
    for (const src of image_urls || []) {
      if (!src || seen.has(src)) continue;
      seen.add(src);
      out.push(src);
    }
    return out;
  }, [image_url, image_urls]);

  const [activeImage, setActiveImage] = useState<string | null>(image_url);

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

  const variantForSize = (s: string | null): ProductVariant | null =>
    s ? variants.find((v) => v.size === s) || null : null;

  const lowestPrice =
    variants.length > 0 ? Math.min(...variants.map((v) => v.price_cents)) / 100 : price;
  const selectedVariant = variantForSize(selectedSize);
  const displayedPrice = selectedVariant
    ? selectedVariant.price_cents / 100
    : lowestPrice;

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
    <div className="product-detail">
      <div className="product-detail__grid">
        <div className="product-detail__art-col">
          {activeImage && (
            <Image
              key={activeImage}
              src={activeImage}
              alt={image_alt || title}
              className="product-detail__cover"
              width={1200}
              height={1200}
              sizes="(max-width: 720px) 100vw, 700px"
              priority
              // Printify caps mockups at 1200x1200; Next's optimizer can only
              // downscale or re-compress, both of which hurt here. Serve the
              // source file directly.
              unoptimized
            />
          )}
        </div>

        <div className="product-detail__content-col">
          <h1 className="product-detail__title">{title}</h1>

          <div className="product-detail__info-bar" data-cols={sortedSizes.length > 0 ? 2 : 1}>
            {sortedSizes.length > 0 && (
              <div className="product-detail__info-cell">
                <span className="product-detail__info-label">Size</span>
                <select
                  className="product-detail__size-select"
                  value={selectedSize || ""}
                  onChange={(e) => { setSelectedSize(e.target.value || null); setStatus("idle"); }}
                  aria-label="Size"
                >
                  <option value="">Pick a size</option>
                  {sortedSizes.map((size) => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="product-detail__info-cell">
              <span className="product-detail__info-label">Price</span>
              <span className="product-detail__info-value">
                ${displayedPrice?.toFixed(2)}
              </span>
            </div>
          </div>

          <div className="product-detail__action-row">
            <div className="product-detail__actions">
              <button
                type="button"
                className={`product-detail__btn product-detail__btn--buy-album${inCart ? " product-detail__btn--in-cart" : ""}`}
                disabled={!selectedVariant && sortedSizes.length > 0}
                onClick={handleBuy}
              >
                {buyLabel}
              </button>
            </div>
          </div>

          {description && (
            <div className="product-detail__summary">
              <div className="product-detail__summary-text">{description}</div>
            </div>
          )}

          <p className="merch-detail__disclaimer">
            All sales final — no returns, exchanges, or refunds.
          </p>

          {gallery.length > 1 && (
            <div className="product-detail__gallery" role="list" aria-label="Product images">
              {gallery.map((src) => {
                const isActive = src === activeImage;
                return (
                  <button
                    key={src}
                    type="button"
                    role="listitem"
                    onClick={() => setActiveImage(src)}
                    className={`product-detail__thumb${isActive ? " product-detail__thumb--active" : ""}`}
                    aria-pressed={isActive}
                    aria-label="Show this image"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="" loading="lazy" />
                  </button>
                );
              })}
            </div>
          )}

          <p className="merch-detail__back">
            <Link href="/merch">← All merch</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
