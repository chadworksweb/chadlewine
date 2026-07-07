"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useCart } from "@/components/Cart";
import { releaseFormatLabel, type ReleaseFormat } from "@/lib/release-labels";
import type { SkuGalleryImage, SkuVariantRow } from "@/lib/release-skus";
import "./FormatShowcase.css";

export interface FormatShowcaseSku {
  id: string;
  format: ReleaseFormat;
  price: number | null;
  status: "available" | "preorder" | "sold_out";
  stock: number | null;
  gallery_images: SkuGalleryImage[];
  variants: SkuVariantRow[];
}

interface CommonProps {
  parentId: string;
  title: string;
  slug: string;
  coverArtPath: string | null;
  skus: FormatShowcaseSku[];
  // Fires whenever the selected SKU changes (including initial mount). The
  // parent uses this to swap the left-column art for the selected format's
  // gallery.
  onSelectionChange?: (sku: FormatShowcaseSku | null) => void;
}

interface ReleaseProps extends CommonProps {
  kind: "release";
}

interface SongProps extends CommonProps {
  kind: "song";
}

type Props = ReleaseProps | SongProps;

function fmtUsd(n: number): string {
  return "$" + n.toFixed(2);
}

function computeUnitPrice(
  sku: FormatShowcaseSku,
  variant: SkuVariantRow | null,
): number | null {
  if (sku.price === null) return null;
  return sku.price + (variant ? variant.price_delta : 0);
}

// useSearchParams() (read below for the ?format= preselect) triggers a CSR
// bailout during static prerender unless it sits under a Suspense boundary.
// Wrapping the inner component keeps the song/release pages statically
// cacheable: their shell prerenders and the format picker resolves on the client.
export function FormatShowcase(props: Props) {
  return (
    <Suspense fallback={<FormatShowcaseFallback />}>
      <FormatShowcaseInner {...props} />
    </Suspense>
  );
}

function FormatShowcaseFallback() {
  return (
    <button
      type="button"
      className="track-detail__btn track-detail__btn--buy-album"
      disabled
      aria-hidden="true"
    >
      Loading...
    </button>
  );
}

function FormatShowcaseInner(props: Props) {
  const cart = useCart();
  const skus = props.skus;

  // ?format=vinyl|cd|cassette|digital on the URL pre-selects that SKU on
  // mount. Used by the /merch physical_music cards so a vinyl card lands on
  // the release page with the vinyl format already chosen.
  const searchParams = useSearchParams();
  const initialId = useMemo(() => {
    const requested = (searchParams?.get("format") || "").toLowerCase();
    if (requested) {
      const matched = skus.find((s) => s.format === requested);
      if (matched) return matched.id;
    }
    return skus.find((s) => s.status !== "sold_out")?.id ?? skus[0]?.id ?? null;
  }, [skus, searchParams]);
  const [selectedSkuId, setSelectedSkuId] = useState<string | null>(initialId);
  // SKUs that have ever been selected. Used to persist the post-animation
  // rest state on each card's mockup (e.g. EQ bars stay at their settled
  // heights after deselect instead of snapping back to flat).
  const [playedSkuIds, setPlayedSkuIds] = useState<Set<string>>(
    () => (initialId ? new Set([initialId]) : new Set()),
  );
  const selectedIndex = useMemo(
    () => Math.max(0, skus.findIndex((s) => s.id === selectedSkuId)),
    [skus, selectedSkuId],
  );
  const selectedSku = skus[selectedIndex] ?? null;

  // Notify the parent of selection changes (including the initial mount) so
  // the album/song page can swap its left-column art for the format gallery.
  const onSelectionChange = props.onSelectionChange;
  useEffect(() => {
    onSelectionChange?.(selectedSku);
    if (selectedSku) {
      setPlayedSkuIds((prev) => {
        if (prev.has(selectedSku.id)) return prev;
        const next = new Set(prev);
        next.add(selectedSku.id);
        return next;
      });
    }
  }, [selectedSku, onSelectionChange]);

  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const selectedVariant = useMemo(() => {
    if (!selectedSku || selectedSku.variants.length === 0) return null;
    return (
      selectedSku.variants.find((v) => v.id === selectedVariantId) ??
      selectedSku.variants.find((v) => v.status !== "sold_out") ??
      selectedSku.variants[0] ??
      null
    );
  }, [selectedSku, selectedVariantId]);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Array<HTMLButtonElement | null>>([]);
  // Timestamp until which the scroll listener should ignore "nearest card"
  // updates. Card clicks set selection immediately AND start a smooth scroll;
  // without this lock, the listener flickers selection through intermediate
  // cards mid-animation. Arrows leave this 0 so the listener still drives
  // their selection naturally.
  const programmaticUntilRef = useRef(0);

  const scrollToIndex = useCallback(
    (idx: number, opts?: { lockSelection?: boolean }) => {
      const scroller = scrollerRef.current;
      const target = cardRefs.current[idx];
      if (!scroller || !target) return;
      if (opts?.lockSelection) {
        programmaticUntilRef.current = Date.now() + 700;
      }
      // Center the card by scrolling the scroller's OWN scrollLeft -- NOT
      // element.scrollIntoView, which walks every scroll ancestor incl. the
      // window and lurched the whole page vertically on mobile whenever the
      // format row wasn't horizontally scrollable (e.g. 2 cards that fit).
      const sRect = scroller.getBoundingClientRect();
      const tRect = target.getBoundingClientRect();
      const delta = tRect.left - sRect.left - (scroller.clientWidth - tRect.width) / 2;
      scroller.scrollTo({ left: scroller.scrollLeft + delta, behavior: "smooth" });
    },
    [],
  );

  // When the user scrolls/swipes, auto-select the card nearest the center.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        // Suppress nearest-card auto-select during a click-driven smooth scroll
        // -- selection is already set explicitly by the click handler.
        if (Date.now() < programmaticUntilRef.current) return;
        const rect = scroller.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        let bestIdx = 0;
        let bestDist = Infinity;
        cardRefs.current.forEach((el, i) => {
          if (!el) return;
          const r = el.getBoundingClientRect();
          const d = Math.abs(r.left + r.width / 2 - cx);
          if (d < bestDist) {
            bestDist = d;
            bestIdx = i;
          }
        });
        const id = skus[bestIdx]?.id ?? null;
        if (id && id !== selectedSkuId) {
          setSelectedSkuId(id);
          setSelectedVariantId(null);
        }
      });
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [skus, selectedSkuId]);

  if (skus.length === 0) {
    return (
      <button
        type="button"
        className="track-detail__btn track-detail__btn--buy-album"
        disabled
      >
        Not yet available
      </button>
    );
  }

  const unitPrice = selectedSku ? computeUnitPrice(selectedSku, selectedVariant) : null;
  const effectiveStatus =
    selectedVariant?.status ?? selectedSku?.status ?? "available";
  const isSoldOut = effectiveStatus === "sold_out";
  const isPreorder = effectiveStatus === "preorder";

  const probeKey = selectedSku
    ? {
        type: props.kind as "release" | "song",
        id: props.parentId,
        format: null,
        sku_id: selectedSku.id,
        sku_variant_id: selectedVariant?.id ?? null,
        product_config: null,
      }
    : null;
  const inCart = probeKey ? cart.hasItem(probeKey) : false;

  const buyDisabled =
    !selectedSku || unitPrice === null || isSoldOut || inCart;

  function onAdd() {
    if (!selectedSku || unitPrice === null || isSoldOut || inCart) return;
    const variantLabel = [
      releaseFormatLabel(selectedSku.format),
      selectedVariant?.label || null,
    ]
      .filter((s): s is string => !!s)
      .join(" / ");
    cart.add({
      type: props.kind,
      id: props.parentId,
      title: props.title,
      slug: props.slug,
      price: unitPrice,
      format: null,
      cover_art_path: props.coverArtPath,
      sku_id: selectedSku.id,
      sku_variant_id: selectedVariant?.id ?? null,
      variant_label: variantLabel || null,
    });
  }

  function onClickCard(id: string, idx: number) {
    setSelectedSkuId(id);
    setSelectedVariantId(null);
    scrollToIndex(idx, { lockSelection: true });
  }

  const hasMultiple = skus.length > 1;
  // Show carousel chrome (arrows + dots) only when there are too many cards
  // to fit comfortably in view. Below the threshold, the cards just sit in
  // a centered row; above it, the chrome turns back on automatically.
  const isCrowded = skus.length > 3;
  const atStart = selectedIndex === 0;
  const atEnd = selectedIndex === skus.length - 1;

  // Digital-only: render the bare pre-showcase buy button -- no mockup,
  // no wrapper, kind-aware class and label. There's no physical product
  // to show, so the carousel adds nothing.
  if (skus.length === 1 && skus[0]?.format === "digital") {
    const isRelease = props.kind === "release";
    const idleLabel = isRelease ? "Add Album to Cart" : "Add Song to Cart";
    const inCartLabel = isRelease ? "Album Already in Cart" : "Already in Cart";
    const btnModifier = isRelease
      ? "track-detail__btn--buy-album"
      : "track-detail__btn--buy";
    return (
      <button
        type="button"
        className={`track-detail__btn ${btnModifier}${inCart ? " track-detail__btn--in-cart" : ""}${isPreorder && !inCart && !isSoldOut ? " track-detail__btn--preorder-pulse" : ""}`}
        disabled={buyDisabled}
        aria-disabled={buyDisabled}
        onClick={onAdd}
      >
        {inCart
          ? inCartLabel
          : isSoldOut
            ? "Sold out"
            : isPreorder
              ? "Pre-order"
              : idleLabel}
      </button>
    );
  }

  return (
    <div className="format-showcase">
      <div className="format-showcase__viewport">
        {isCrowded && (
          <button
            type="button"
            className="format-showcase__arrow format-showcase__arrow--prev"
            aria-label="Previous format"
            disabled={atStart}
            onClick={() => scrollToIndex(Math.max(0, selectedIndex - 1))}
          >
            <span aria-hidden="true">&lt;</span>
          </button>
        )}

        <div
          ref={scrollerRef}
          className={`format-showcase__scroller${isCrowded ? "" : " is-fits"}`}
          role="radiogroup"
          aria-label="Format"
        >
          {skus.map((sku, idx) => {
            const checked = sku.id === selectedSkuId;
            const cardSoldOut = sku.status === "sold_out";
            const isPreorderCard = sku.status === "preorder";
            return (
              <button
                key={sku.id}
                ref={(el) => {
                  cardRefs.current[idx] = el;
                }}
                type="button"
                role="radio"
                aria-checked={checked}
                className={`format-showcase__card${checked ? " is-selected" : ""}${cardSoldOut ? " is-sold-out" : ""}${playedSkuIds.has(sku.id) ? " has-played" : ""}`}
                onClick={() => onClickCard(sku.id, idx)}
              >
                <div className="format-showcase__card-art">
                  {sku.format === "digital" ? (
                    <DigitalMockup />
                  ) : sku.format === "vinyl" ? (
                    <VinylMockup />
                  ) : (
                    <img
                      src={`/format-templates/${sku.format}.svg`}
                      alt=""
                      className="format-showcase__template"
                      draggable={false}
                    />
                  )}
                  {(isPreorderCard || cardSoldOut) && (
                    <span
                      className={`format-showcase__card-badge${cardSoldOut ? " is-sold-out" : ""}`}
                    >
                      {cardSoldOut ? "Sold out" : "Pre-order"}
                    </span>
                  )}
                </div>
                <div className="format-showcase__card-meta">
                  <span className="format-showcase__card-label">
                    {releaseFormatLabel(sku.format)}
                  </span>
                  {sku.price !== null && (
                    <span className="format-showcase__card-price">
                      {fmtUsd(sku.price)}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {hasMultiple && (
          <button
            type="button"
            className="format-showcase__arrow format-showcase__arrow--next"
            aria-label="Next format"
            disabled={atEnd}
            onClick={() => scrollToIndex(Math.min(skus.length - 1, selectedIndex + 1))}
          >
            <span aria-hidden="true">&gt;</span>
          </button>
        )}
      </div>

      {isCrowded && (
        <div className="format-showcase__dots" role="presentation">
          {skus.map((sku, idx) => (
            <button
              key={sku.id}
              type="button"
              className={`format-showcase__dot${selectedIndex === idx ? " is-active" : ""}`}
              aria-label={`Go to ${releaseFormatLabel(sku.format)}`}
              onClick={() => onClickCard(sku.id, idx)}
            />
          ))}
        </div>
      )}

      {selectedSku && selectedSku.variants.length > 0 && (
        <div
          className="format-showcase__variants"
          role="radiogroup"
          aria-label="Variant"
        >
          {selectedSku.variants.map((v) => {
            const checked = (selectedVariant?.id ?? null) === v.id;
            const variantSoldOut = v.status === "sold_out";
            return (
              <button
                key={v.id}
                type="button"
                role="radio"
                aria-checked={checked}
                disabled={variantSoldOut}
                className={`format-showcase__variant${checked ? " is-selected" : ""}${variantSoldOut ? " is-sold-out" : ""}`}
                onClick={() => setSelectedVariantId(v.id)}
              >
                <span>{v.label}</span>
                {v.price_delta !== 0 && (
                  <span className="format-showcase__variant-delta">
                    {v.price_delta > 0 ? "+" : ""}
                    {fmtUsd(v.price_delta)}
                  </span>
                )}
                {v.status === "preorder" && (
                  <span className="format-showcase__variant-badge">Pre-order</span>
                )}
                {variantSoldOut && (
                  <span className="format-showcase__variant-badge is-sold-out">
                    Sold out
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <button
        type="button"
        className={`track-detail__btn track-detail__btn--buy-album${inCart ? " track-detail__btn--in-cart" : ""}${isPreorder && !inCart && !isSoldOut ? " track-detail__btn--preorder-pulse" : ""}`}
        disabled={buyDisabled}
        aria-disabled={buyDisabled}
        onClick={onAdd}
      >
        {inCart
          ? "Already in Cart"
          : isSoldOut
            ? "Sold out"
            : isPreorder
              ? "Pre-order"
              : selectedSku
                ? `Add ${releaseFormatLabel(selectedSku.format)}${props.kind === "release" ? " Album" : ""} to Cart`
                : "Add to Cart"}
      </button>
    </div>
  );
}

// Inline mockup SVGs. Inlining (instead of <img src=".svg">) lets CSS reach
// the bar / disc elements so the bounce + spin animations fire only on the
// selected card.

// Direct port of the Artist Empowerment Suite EQ mechanics: 10 bars, each
// with its own ~3s irregular keyframe sequence (eq1..eq10) at slightly
// different durations so they pulse organically out of sync. Styling stays
// in the chadlewine palette -- cyan-to-gold vertical gradient.
function DigitalMockup() {
  const barCount = 10;
  const barWidth = 14;
  const barGap = 6;
  const totalWidth = barCount * barWidth + (barCount - 1) * barGap; // 10*14 + 9*6 = 194
  const startX = 48 + (304 - totalWidth) / 2;
  const baseline = 322;
  const maxHeight = 180;

  return (
    <svg
      className="format-showcase__inline-mockup"
      viewBox="0 0 400 400"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="fs-eq-gradient" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#00d4ff" />
          <stop offset="100%" stopColor="#ff9500" />
        </linearGradient>
      </defs>

      <rect x="48" y="48" width="304" height="304" fill="#12121a" stroke="#00d4ff" strokeWidth="2" />
      <path d="M 48 64 L 48 48 L 64 48" stroke="#ff9500" strokeWidth="2" fill="none" strokeLinecap="square" />
      <path d="M 352 336 L 352 352 L 336 352" stroke="#ff9500" strokeWidth="2" fill="none" strokeLinecap="square" />

      <g className="format-showcase__eq">
        {Array.from({ length: barCount }).map((_, i) => (
          <rect
            key={i}
            className="format-showcase__eq-bar"
            x={startX + i * (barWidth + barGap)}
            y={baseline - maxHeight}
            width={barWidth}
            height={maxHeight}
            rx="2"
            fill="url(#fs-eq-gradient)"
          />
        ))}
      </g>
    </svg>
  );
}

function VinylMockup() {
  return (
    <svg
      className="format-showcase__inline-mockup"
      viewBox="0 0 400 400"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="fs-vinyl-sheen" cx="0.4" cy="0.4" r="0.7">
          <stop offset="0%" stopColor="#1a1a2a" stopOpacity="0.9" />
          <stop offset="60%" stopColor="#0a0a14" stopOpacity="1" />
        </radialGradient>
      </defs>

      {/* Sleeve and disc both centered on the viewBox (x=200, y=200). */}
      <rect x="80" y="80" width="240" height="240" fill="#12121a" stroke="#00d4ff" strokeWidth="2" />
      <path d="M 80 96 L 80 80 L 96 80" stroke="#ff9500" strokeWidth="2" fill="none" strokeLinecap="square" />
      <path d="M 320 304 L 320 320 L 304 320" stroke="#ff9500" strokeWidth="2" fill="none" strokeLinecap="square" />

      {/* Vinyl disc -- center sits exactly on the sleeve's right edge (x=260)
          so half the disc overlays the sleeve and half hangs off to the
          right. Combined bounding box (20..380) is then centered in the
          viewBox by the 20px margins on either side. */}
      <g className="format-showcase__vinyl-disc">
        <circle cx="200" cy="200" r="120" fill="url(#fs-vinyl-sheen)" stroke="#00d4ff" strokeWidth="1.5" />
        <circle cx="200" cy="200" r="104" fill="none" stroke="#1f1f2e" strokeWidth="0.5" />
        <circle cx="200" cy="200" r="88" fill="none" stroke="#1f1f2e" strokeWidth="0.5" />
        <circle cx="200" cy="200" r="72" fill="none" stroke="#1f1f2e" strokeWidth="0.5" />
        <circle cx="200" cy="200" r="56" fill="none" stroke="#1f1f2e" strokeWidth="0.5" />
        <circle cx="200" cy="200" r="40" fill="#ff9500" />
        <circle cx="200" cy="200" r="40" fill="none" stroke="#00d4ff" strokeWidth="1.5" />
        <circle cx="200" cy="200" r="20" fill="none" stroke="#0d0d1a" strokeWidth="1" opacity="0.5" />
        {/* Tiny notch on the label so the rotation reads visually */}
        <rect x="198" y="164" width="4" height="8" fill="#0d0d1a" opacity="0.7" />
        <circle cx="200" cy="200" r="3" fill="#0d0d1a" />
      </g>

      <text
        x="200"
        y="376"
        fill="#00d4ff"
        fontFamily="'Share Tech Mono', 'Courier New', monospace"
        fontSize="11"
        textAnchor="middle"
        letterSpacing="3"
        opacity="0.85"
      >
        LP / 12 INCH
      </text>
    </svg>
  );
}
