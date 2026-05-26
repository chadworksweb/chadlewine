// Cart shipping calculator. Runs server-side at the Stripe embedded-checkout
// onShippingDetailsChange callback (see api/checkout/calculate-shipping), once
// the buyer has entered an address.
//
// Two fulfillment sources, summed:
//   - Printify lines  -> destination-aware quote from Printify's shipping API
//                        (the rate Printify itself bills us). We charge
//                        `standard`.
//   - Manual lines    -> rates Chad sets per SKU/product (first-item + per
//                        additional-item add-on). Modeled as one combined box:
//                        max(first across manual lines) + every other manual
//                        line's addl.
//
// Digital lines (digital SKUs, ringtones) never contribute shipping.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getOrderShippingCost, type PrintifyOrderLineItem } from "@/lib/printify";

// Compact cart line shape, shared with the Stripe webhook. sk = sku_id (encodes
// the parent release/song), v = sku_variant_id, i = item_id (merch/legacy),
// c = index into cfg_<idx> session metadata for a chosen curated variant.
export interface CartLine {
  t: "s" | "a" | "r" | "m" | "o";
  i?: string | null;
  sk?: string;
  v?: string;
  f?: "mp3" | "flac" | "wav" | null;
  c?: number;
}

export interface ShippingAddress {
  name?: string | null;
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
}

export interface ShippingQuote {
  amountCents: number;
  hasPrintify: boolean;
  hasManualPhysical: boolean;
  // True when a Printify quote was attempted but the API call failed. Callers
  // decide whether to block checkout or fall back; we never silently ship for
  // free on an error.
  printifyError: boolean;
}

interface ManualRate {
  first: number;
  addl: number;
}

function n(v: unknown): number {
  const x = typeof v === "number" ? v : parseInt(String(v ?? ""), 10);
  return Number.isFinite(x) ? x : 0;
}

// Resolve a curated-variant id from the cfg_<idx> session metadata, if present.
function variantIdFromConfig(
  line: CartLine,
  cfgMetadata: Record<string, string | undefined>,
): number | null {
  if (typeof line.c !== "number") return null;
  const raw = cfgMetadata[`cfg_${line.c}`];
  if (!raw) return null;
  try {
    const cfg = JSON.parse(raw) as { variant_id?: unknown };
    return typeof cfg.variant_id === "number" ? cfg.variant_id : null;
  } catch {
    return null;
  }
}

export async function calculateCartShipping(
  supabase: SupabaseClient,
  cartLines: CartLine[],
  address: ShippingAddress,
  cfgMetadata: Record<string, string | undefined> = {},
): Promise<ShippingQuote> {
  const printifyLineItems: PrintifyOrderLineItem[] = [];
  const manualRates: ManualRate[] = [];

  for (const line of cartLines) {
    if (line.t === "r") continue; // ringtone = digital

    if (line.t === "m" || line.t === "o") {
      if (!line.i) continue;
      const { data: product } = await supabase
        .from("merch")
        .select("fulfillment, printify_product_id, shipping_first_cents, shipping_addl_cents")
        .eq("id", line.i)
        .single();
      if (!product) continue;

      const isPrintify =
        typeof product.fulfillment === "string" &&
        product.fulfillment.startsWith("printify");

      if (isPrintify && product.printify_product_id) {
        const variantId = variantIdFromConfig(line, cfgMetadata);
        if (variantId !== null) {
          printifyLineItems.push({
            product_id: product.printify_product_id,
            variant_id: variantId,
            quantity: 1,
          });
          continue;
        }
        // Printify product without a resolvable variant -- treat as manual so
        // we don't drop shipping entirely; falls through to manual rates.
      }
      manualRates.push({
        first: n(product.shipping_first_cents),
        addl: n(product.shipping_addl_cents),
      });
      continue;
    }

    // release ("a") / song ("s") -- SKU drives fulfillment + format.
    if (!line.sk) continue;
    const table = line.t === "a" ? "release_skus" : "song_skus";
    const { data: sku } = await supabase
      .from(table)
      .select(
        "format, fulfillment_method, printify_product_id, printify_variant_id, shipping_first_cents, shipping_addl_cents",
      )
      .eq("id", line.sk)
      .single();
    if (!sku) continue;
    if (sku.format === "digital") continue; // digital ships nothing

    if (
      sku.fulfillment_method === "printify" &&
      sku.printify_product_id &&
      sku.printify_variant_id
    ) {
      printifyLineItems.push({
        product_id: String(sku.printify_product_id),
        variant_id: Number(sku.printify_variant_id),
        quantity: 1,
      });
    } else {
      manualRates.push({
        first: n(sku.shipping_first_cents),
        addl: n(sku.shipping_addl_cents),
      });
    }
  }

  // Manual: one combined box -> highest first-item charge as the base, plus
  // every other manual line's additional-item add-on.
  let manualCents = 0;
  if (manualRates.length > 0) {
    let baseIdx = 0;
    for (let i = 1; i < manualRates.length; i++) {
      if (manualRates[i].first > manualRates[baseIdx].first) baseIdx = i;
    }
    manualCents = manualRates[baseIdx].first;
    for (let i = 0; i < manualRates.length; i++) {
      if (i !== baseIdx) manualCents += manualRates[i].addl;
    }
  }

  let printifyCents = 0;
  let printifyError = false;
  if (printifyLineItems.length > 0) {
    try {
      const quote = await getOrderShippingCost({
        line_items: printifyLineItems,
        address_to: {
          first_name: (address.name || "Customer").split(/\s+/)[0] || "Customer",
          last_name: (address.name || "").split(/\s+/).slice(1).join(" ") || "-",
          email: "",
          country: address.country || "US",
          region: address.state || "",
          address1: address.line1 || "",
          address2: address.line2 || undefined,
          city: address.city || "",
          zip: address.postal_code || "",
        },
      });
      printifyCents = n(quote.standard);
    } catch (e) {
      console.error("[shipping] Printify quote failed:", (e as Error).message);
      printifyError = true;
    }
  }

  return {
    amountCents: manualCents + printifyCents,
    hasPrintify: printifyLineItems.length > 0,
    hasManualPhysical: manualRates.length > 0,
    printifyError,
  };
}
