"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useCart } from "@/components/Cart";
import type { ProductVariant } from "@/components/MerchProductCard";
import type { GalleryImage } from "@/lib/product-images";

const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"];

interface Props {
  id: string;
  title: string;
  description: string | null;
  gallery: GalleryImage[];
  price: number | null;
  variants: ProductVariant[];
  linkedPrintSlug?: string | null;
  isSuperIndividual?: boolean;
}

export function MerchProductDetail({
  id,
  title,
  description,
  gallery,
  price,
  variants,
  linkedPrintSlug,
  isSuperIndividual = false,
}: Props) {
  const { add, open, hasItem } = useCart();
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "added">("idle");

  const heroImage = gallery[0] ?? null;
  const [activeImage, setActiveImage] = useState<string | null>(heroImage?.url ?? null);

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
      cover_art_path: heroImage?.url ?? null,
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

  const activeImageMeta = gallery.find((g) => g.url === activeImage) ?? heroImage;
  const activeAlt = activeImageMeta?.alt || title;

  const galleryThumbs = gallery.length > 1 && (
    <>
      {gallery.map((img) => {
        const isActive = img.url === activeImage;
        return (
          <button
            key={img.id}
            type="button"
            role="listitem"
            onClick={() => setActiveImage(img.url)}
            className={`product-detail__thumb${isActive ? " product-detail__thumb--active" : ""}`}
            aria-current={isActive ? "true" : undefined}
            aria-label={img.alt || "Show this image"}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.url} alt={img.alt || ""} decoding="async" />
          </button>
        );
      })}
    </>
  );

  return (
    <div className="product-detail">
      <div className="product-detail__grid">
        <div className="product-detail__art-col">
          {activeImage && (
            <Image
              src={activeImage}
              alt={activeAlt}
              className="product-detail__cover"
              width={1200}
              height={1200}
              sizes="(max-width: 720px) 100vw, 700px"
              priority
              // Printify caps mockups at 1200x1200; Next's optimizer can only
              // downscale or re-compress, both of which hurt here. Custom
              // uploads from Bunny are user-sized — also serve as-is.
              unoptimized
            />
          )}
          {galleryThumbs && (
            <div className="product-detail__gallery product-detail__gallery--floating" role="list" aria-label="Product images">
              {galleryThumbs}
            </div>
          )}
        </div>

        <div className="product-detail__content-col">
          <h1 className="product-detail__title">{title}</h1>

          <div className="product-detail__info-bar" data-cols={sortedSizes.length > 0 ? 2 : 1}>
            <div className="product-detail__info-cell product-detail__info-cell--inverted">
              <span className="product-detail__info-label">Price</span>
              <span className="product-detail__info-value">
                ${displayedPrice?.toFixed(2)}
              </span>
            </div>
            {sortedSizes.length > 0 && (
              <div className="product-detail__info-cell">
                <span className="product-detail__info-label">Size</span>
                <div className="product-detail__size-options" role="radiogroup" aria-label="Size">
                  {sortedSizes.map((size) => {
                    const isActive = selectedSize === size;
                    return (
                      <button
                        key={size}
                        type="button"
                        role="radio"
                        aria-checked={isActive}
                        className={`product-detail__size-btn${isActive ? " product-detail__size-btn--active" : ""}`}
                        onClick={() => { setSelectedSize(size); setStatus("idle"); }}
                      >
                        {size}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="product-detail__action-row">
            <div className={`product-detail__actions${linkedPrintSlug ? " product-detail__actions--with-print" : ""}`}>
              <button
                type="button"
                className={`product-detail__btn product-detail__btn--buy-album${inCart ? " product-detail__btn--in-cart" : ""}`}
                disabled={!selectedVariant && sortedSizes.length > 0}
                onClick={handleBuy}
              >
                {buyLabel}
              </button>
              {linkedPrintSlug && (
                <Link
                  href={`/art/${linkedPrintSlug}`}
                  className="product-detail__btn product-detail__btn--buy-print"
                >
                  Buy print
                </Link>
              )}
            </div>
          </div>

          {description && (
            <div className="product-detail__summary">
              <div className="product-detail__summary-text">{description}</div>
            </div>
          )}

          <p className="merch-detail__disclaimer">
            All sales final — no returns, exchanges, or refunds, with exceptions for damage or incorrect items.
          </p>

          <div
            className={`merch-detail__footer-nav${isSuperIndividual ? "" : " merch-detail__footer-nav--solo"}`}
          >
            <Link
              href="/merch"
              className="merch-detail__nav-btn merch-detail__nav-btn--back"
            >
              ← Back to all merch
            </Link>
            {isSuperIndividual && (
              <Link
                href="/super-individual"
                className="merch-detail__nav-btn merch-detail__nav-btn--si"
              >
                <span>What is Super Individual?</span>
                <svg
                  className="merch-detail__nav-arrow"
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path
                    d="M5 12h13M13 6l6 6-6 6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
