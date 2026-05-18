"use client";

import { useMemo, useState } from "react";
import { useCart } from "@/components/Cart";
import { releaseFormatLabel, skuStatusLabel } from "@/lib/release-labels";
import type { SkuVariantRow } from "@/lib/release-skus";
import "./SkuPicker.css";

export interface SkuPickerSku {
  id: string;
  format: "digital" | "vinyl" | "cd" | "cassette";
  price: number | null;
  status: "available" | "preorder" | "sold_out";
  stock: number | null;
  variants: SkuVariantRow[];
}

interface CommonProps {
  parentId: string;
  title: string;
  slug: string;
  coverArtPath: string | null;
  skus: SkuPickerSku[];
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

function computeUnitPrice(sku: SkuPickerSku, variant: SkuVariantRow | null): number | null {
  if (sku.price === null) return null;
  return sku.price + (variant ? variant.price_delta : 0);
}

export function SkuPicker(props: Props) {
  const cart = useCart();
  const sellable = useMemo(
    () => props.skus.filter((s) => s.status !== "sold_out" || true),
    [props.skus],
  );
  const [selectedSkuId, setSelectedSkuId] = useState<string | null>(
    sellable.find((s) => s.status !== "sold_out")?.id ?? sellable[0]?.id ?? null,
  );
  const selectedSku = useMemo(
    () => sellable.find((s) => s.id === selectedSkuId) ?? null,
    [sellable, selectedSkuId],
  );

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

  if (sellable.length === 0) {
    return (
      <button type="button" className="track-detail__btn track-detail__btn--buy-album" disabled>
        Not yet available
      </button>
    );
  }

  const unitPrice = selectedSku ? computeUnitPrice(selectedSku, selectedVariant) : null;
  const effectiveStatus = selectedVariant?.status ?? selectedSku?.status ?? "available";
  const isSoldOut = effectiveStatus === "sold_out";
  const isPreorder = effectiveStatus === "preorder";

  const probeKey = selectedSku
    ? {
        type: (props.kind === "release" ? "release" : "song") as "release" | "song",
        id: props.parentId,
        format: null,
        sku_id: selectedSku.id,
        sku_variant_id: selectedVariant?.id ?? null,
        product_config: null,
      }
    : null;
  const inCart = probeKey ? cart.hasItem(probeKey) : false;

  const disabled = !selectedSku || unitPrice === null || isSoldOut || inCart;

  function onAdd() {
    if (!selectedSku || unitPrice === null || isSoldOut || inCart) return;
    const variantLabel = [
      releaseFormatLabel(selectedSku.format),
      selectedVariant?.label || null,
    ]
      .filter((s): s is string => !!s)
      .join(" · ");
    // TODO(task-5): cart-checkout server route must read sku_id/sku_variant_id
    // to source price + downloads from release_skus/song_skus instead of the
    // legacy column lookups.
    cart.add({
      type: props.kind === "release" ? "release" : "song",
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

  // Single SKU + no variants: render the bare historical button. Match the
  // old design exactly -- no picker wrapper, no price/status summary, no
  // extra chrome. The richer picker UI only renders when there's a real
  // format/variant choice to make.
  const onlyOne = sellable.length === 1 && (sellable[0]?.variants.length ?? 0) === 0;
  if (onlyOne) {
    const isRelease = props.kind === "release";
    const idleLabel = isRelease ? "Add Album to Cart" : "Add Song to Cart";
    const inCartLabel = isRelease ? "Album Already in Cart" : "Already in Cart";
    const btnModifier = isRelease ? "track-detail__btn--buy-album" : "track-detail__btn--buy";
    return (
      <button
        type="button"
        className={`track-detail__btn ${btnModifier}${inCart ? " track-detail__btn--in-cart" : ""}`}
        disabled={disabled}
        aria-disabled={disabled}
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
    <div className="sku-picker">
      {!onlyOne && (
        <fieldset className="sku-picker__field">
          <legend className="sku-picker__legend">Format</legend>
          <div className="sku-picker__options" role="radiogroup" aria-label="Format">
            {sellable.map((s) => {
              const checked = selectedSkuId === s.id;
              const skuSoldOut = s.status === "sold_out";
              return (
                <label
                  key={s.id}
                  className={`sku-picker__option${checked ? " is-selected" : ""}${skuSoldOut ? " is-sold-out" : ""}`}
                >
                  <input
                    type="radio"
                    name="sku-format"
                    value={s.id}
                    checked={checked}
                    disabled={skuSoldOut}
                    onChange={() => {
                      setSelectedSkuId(s.id);
                      setSelectedVariantId(null);
                    }}
                  />
                  <span className="sku-picker__option-label">
                    {releaseFormatLabel(s.format)}
                    {s.price !== null && (
                      <span className="sku-picker__option-price"> — {fmtUsd(s.price)}</span>
                    )}
                    {s.status === "preorder" && (
                      <span className="sku-picker__option-badge">Pre-order</span>
                    )}
                    {skuSoldOut && (
                      <span className="sku-picker__option-badge sku-picker__option-badge--sold-out">
                        Sold out
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      {selectedSku && selectedSku.variants.length > 0 && (
        <fieldset className="sku-picker__field">
          <legend className="sku-picker__legend">Variant</legend>
          <div className="sku-picker__options" role="radiogroup" aria-label="Variant">
            {selectedSku.variants.map((v) => {
              const checked = (selectedVariant?.id ?? null) === v.id;
              const variantSoldOut = v.status === "sold_out";
              return (
                <label
                  key={v.id}
                  className={`sku-picker__option${checked ? " is-selected" : ""}${variantSoldOut ? " is-sold-out" : ""}`}
                >
                  <input
                    type="radio"
                    name="sku-variant"
                    value={v.id}
                    checked={checked}
                    disabled={variantSoldOut}
                    onChange={() => setSelectedVariantId(v.id)}
                  />
                  <span className="sku-picker__option-label">
                    {v.label}
                    {v.price_delta !== 0 && (
                      <span className="sku-picker__option-price">
                        {" "}({v.price_delta > 0 ? "+" : ""}{fmtUsd(v.price_delta)})
                      </span>
                    )}
                    {v.status === "preorder" && (
                      <span className="sku-picker__option-badge">Pre-order</span>
                    )}
                    {variantSoldOut && (
                      <span className="sku-picker__option-badge sku-picker__option-badge--sold-out">
                        Sold out
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      <div className="sku-picker__summary">
        {selectedSku && (
          <>
            {unitPrice !== null && (
              <span className="sku-picker__price">{fmtUsd(unitPrice)}</span>
            )}
            <span className="sku-picker__status">{skuStatusLabel(effectiveStatus)}</span>
          </>
        )}
      </div>

      <button
        type="button"
        className={`track-detail__btn track-detail__btn--buy-album${inCart ? " track-detail__btn--in-cart" : ""}`}
        disabled={disabled}
        aria-disabled={disabled}
        onClick={onAdd}
      >
        {inCart
          ? "Already in Cart"
          : isSoldOut
            ? "Sold out"
            : isPreorder
              ? "Pre-order"
              : "Add to Cart"}
      </button>
    </div>
  );
}
