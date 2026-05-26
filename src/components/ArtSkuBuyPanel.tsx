"use client";

import { useState } from "react";
import { useCart } from "@/components/Cart";
import "./ArtDetail.css";

export type ArtVariant = {
  id: string;
  label: string;
  price_delta: number;
  status: string;
  stock: number | null;
};

export type ArtSku = {
  id: string;
  format: "original" | "limited_print";
  sale_mode: "buy_now" | "inquire";
  price: number | null;
  status: string;
  edition_size: number;
  editions_sold: number;
  coa_enabled: boolean;
  variants: ArtVariant[];
};

type Props = {
  artId: string;
  artTitle: string;
  artSlug: string;
  coverImage: string | null;
  skus: ArtSku[];
};

// Scarcity is the product. State the one-of-one-ness plainly; show sold/reserved
// rather than hiding them (social proof + genuine urgency).
function scarcity(sku: ArtSku): { label: string; tone: "available" | "sold" | "reserved" } {
  if (sku.status === "sold") return { label: "Sold", tone: "sold" };
  if (sku.status === "reserved") return { label: "Reserved", tone: "reserved" };
  if (sku.format === "original") return { label: "Original — the only one", tone: "available" };
  if (sku.edition_size === 0) return { label: "Open edition", tone: "available" };
  const remaining = Math.max(0, sku.edition_size - sku.editions_sold);
  if (remaining === 0) return { label: "Edition sold out", tone: "sold" };
  return { label: `${remaining} of ${sku.edition_size} remaining`, tone: "available" };
}

export function ArtSkuBuyPanel({ artId, artTitle, artSlug, coverImage, skus }: Props) {
  const cart = useCart();
  const sellable = skus
    .filter((s) => ["available", "reserved", "sold", "preorder"].includes(s.status))
    .sort((a, b) => (a.format === "original" ? -1 : 1) - (b.format === "original" ? -1 : 1));

  if (sellable.length === 0) {
    return <div className="art-buy-panel art-buy-panel--empty">Not currently for sale.</div>;
  }

  return (
    <div className="art-buy-panel">
      {sellable.map((sku) => (
        <SkuRow
          key={sku.id}
          sku={sku}
          artId={artId}
          artTitle={artTitle}
          artSlug={artSlug}
          coverImage={coverImage}
          cart={cart}
        />
      ))}
    </div>
  );
}

function SkuRow({
  sku,
  artId,
  artTitle,
  artSlug,
  coverImage,
  cart,
}: {
  sku: ArtSku;
  artId: string;
  artTitle: string;
  artSlug: string;
  coverImage: string | null;
  cart: ReturnType<typeof useCart>;
}) {
  const [variantId, setVariantId] = useState<string | null>(sku.variants[0]?.id ?? null);
  const [showInquiry, setShowInquiry] = useState(false);

  const sc = scarcity(sku);
  const soldOrReserved = sku.status === "sold" || sku.status === "reserved";
  const editionSoldOut =
    sku.format === "limited_print" && sku.edition_size > 0 && sku.editions_sold >= sku.edition_size;
  const unavailable = soldOrReserved || editionSoldOut;

  const variant = sku.variants.find((v) => v.id === variantId) || null;
  const effectivePrice = sku.price === null ? null : Number(sku.price) + (variant?.price_delta ?? 0);
  const heading = sku.format === "original" ? "Original" : "Limited edition print";

  const inCart =
    sku.sale_mode === "buy_now" &&
    cart.hasItem({ type: "art", id: artId, format: null, sku_id: sku.id, sku_variant_id: variantId });

  function addToCart() {
    if (unavailable || effectivePrice === null) return;
    cart.add({
      type: "art",
      id: artId,
      title: artTitle,
      slug: artSlug,
      price: effectivePrice,
      format: null,
      cover_art_path: coverImage,
      sku_id: sku.id,
      sku_variant_id: variantId,
      variant_label: [heading, variant?.label].filter(Boolean).join(" — "),
    });
  }

  return (
    <div className="art-buy-panel__group">
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <h3 className="art-buy-panel__heading">{heading}</h3>
        {effectivePrice !== null && !unavailable && (
          <span className="art-buy-variant__label">${effectivePrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        )}
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", margin: "2px 0 10px" }}>
        <span className={`art-buy-variant__avail${sc.tone !== "available" ? " is-sold" : ""}`}>{sc.label}</span>
        {sku.coa_enabled && (
          <span className="art-buy-variant__avail" title="Ships with a signed Certificate of Authenticity">
            Certificate of Authenticity
          </span>
        )}
      </div>

      {sku.variants.length > 0 && !unavailable && (
        <div style={{ marginBottom: 10 }}>
          <label className="art-buy-variant__label" style={{ display: "block", marginBottom: 4 }}>Framing / option</label>
          <select
            className="obsv-editor__input"
            value={variantId ?? ""}
            onChange={(e) => setVariantId(e.target.value || null)}
          >
            {sku.variants.map((v) => (
              <option key={v.id} value={v.id} disabled={v.status !== "available" && v.status !== "preorder"}>
                {v.label}
                {Number(v.price_delta) ? ` (+$${Number(v.price_delta).toFixed(2)})` : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      {unavailable ? (
        <button type="button" className="art-buy-variant__btn" disabled aria-disabled>
          {sku.status === "reserved" ? "Reserved" : "Sold"}
        </button>
      ) : sku.sale_mode === "inquire" ? (
        <>
          <button
            type="button"
            className="art-buy-variant__btn"
            onClick={() => setShowInquiry((v) => !v)}
          >
            {showInquiry ? "Close" : "Inquire / Reserve"}
          </button>
          {showInquiry && <InquiryForm artId={artId} artSkuId={sku.id} />}
        </>
      ) : (
        <button
          type="button"
          className={`art-buy-variant__btn${inCart ? " art-buy-variant__btn--in-cart" : ""}`}
          onClick={addToCart}
          disabled={inCart || effectivePrice === null}
          aria-disabled={inCart || effectivePrice === null}
        >
          {inCart ? "Already in Cart" : "Add to Cart"}
        </button>
      )}
    </div>
  );
}

function InquiryForm({ artId, artSkuId }: { artId: string; artSkuId: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [reserve, setReserve] = useState(true);
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setState("sending");
    setError(null);
    const res = await fetch("/api/art-inquiry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        art_id: artId,
        art_sku_id: artSkuId,
        buyer_name: name,
        buyer_email: email,
        message,
        reserve,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Could not submit. Please try again.");
      setState("error");
      return;
    }
    setState("done");
  }

  if (state === "done") {
    return (
      <p className="art-buy-variant__avail" style={{ marginTop: 10 }}>
        Thank you -- we&apos;ll be in touch within 24 hours.
      </p>
    );
  }

  return (
    <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
      <input className="obsv-editor__input" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
      <input className="obsv-editor__input" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <textarea className="obsv-editor__input" rows={3} placeholder="Anything you'd like to ask or share (optional)" value={message} onChange={(e) => setMessage(e.target.value)} />
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.8rem" }}>
        <input type="checkbox" checked={reserve} onChange={(e) => setReserve(e.target.checked)} />
        Hold this piece for me while we talk
      </label>
      {error && <p className="art-buy-variant__avail is-sold">{error}</p>}
      <button type="button" className="art-buy-variant__btn" onClick={submit} disabled={state === "sending" || !name || !email}>
        {state === "sending" ? "Sending..." : "Send inquiry"}
      </button>
    </div>
  );
}
