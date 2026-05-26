// Cart shipping calculator. Runs server-side at the Stripe embedded-checkout
// onShippingDetailsChange callback (see api/checkout/calculate-shipping), once
// the buyer has entered an address.
//
// Two fulfillment sources, summed:
//   - Printify lines  -> destination-aware quote from Printify's shipping API
//                        (the rate Printify itself bills us). We charge
//                        `standard`.
//   - Manual lines    -> per-SKU rates Chad sets, by destination zone
//                        (US / Canada / Rest-of-World), modeled as one combined
//                        box: max(first across lines) + every other line's addl.
//
// Free shipping: US orders at/above SHIPPING_FREE_US_THRESHOLD_CENTS ship free
// on every non-exempt line (manual + Printify). A SKU flagged
// free_shipping_exempt (e.g. vinyl drop-shipped from overseas at a cost we
// can't absorb) always charges its zone rate, even on a qualifying US order.
//
// Digital lines (digital SKUs, ringtones) never contribute shipping.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getOrderShippingCost, type PrintifyOrderLineItem } from "@/lib/printify";

// Compact cart line shape, shared with the Stripe webhook. sk = sku_id (encodes
// the parent release/song), v = sku_variant_id, i = item_id (merch/legacy),
// c = index into cfg_<idx> session metadata for a chosen curated variant.
export interface CartLine {
  t: "s" | "a" | "r" | "m" | "o" | "p";
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
  // True when the free-US-shipping threshold zeroed one or more lines.
  freeShippingApplied: boolean;
}

type Zone = "us" | "ca" | "uk" | "row";

interface ManualRate {
  first: number;
  addl: number;
  exempt: boolean;
}

// Any row carrying the manual rate columns (release_skus / song_skus / merch).
interface RateRow {
  shipping_first_cents?: number | null;
  shipping_addl_cents?: number | null;
  shipping_ca_first_cents?: number | null;
  shipping_ca_addl_cents?: number | null;
  shipping_uk_first_cents?: number | null;
  shipping_uk_addl_cents?: number | null;
  shipping_row_first_cents?: number | null;
  shipping_row_addl_cents?: number | null;
  free_shipping_exempt?: boolean | null;
}

function n(v: unknown): number {
  const x = typeof v === "number" ? v : parseInt(String(v ?? ""), 10);
  return Number.isFinite(x) ? x : 0;
}

function freeUsThresholdCents(): number {
  const v = parseInt(process.env.SHIPPING_FREE_US_THRESHOLD_CENTS || "", 10);
  return Number.isFinite(v) && v > 0 ? v : 5000; // default: free US shipping >= $50
}

function zoneFor(country?: string | null): Zone {
  const c = (country || "US").toUpperCase();
  if (c === "US") return "us";
  if (c === "CA") return "ca";
  if (c === "GB") return "uk";
  return "row";
}

// Per-zone first/additional rate for a row. Falls back to 0 (free) when unset.
function rateForZone(row: RateRow, zone: Zone): { first: number; addl: number } {
  if (zone === "ca") {
    return { first: n(row.shipping_ca_first_cents), addl: n(row.shipping_ca_addl_cents) };
  }
  if (zone === "uk") {
    return { first: n(row.shipping_uk_first_cents), addl: n(row.shipping_uk_addl_cents) };
  }
  if (zone === "row") {
    return { first: n(row.shipping_row_first_cents), addl: n(row.shipping_row_addl_cents) };
  }
  return { first: n(row.shipping_first_cents), addl: n(row.shipping_addl_cents) };
}

// Combine a set of manual lines into one box: highest first-item charge as the
// base, plus every other line's additional-item add-on.
function combineManual(rates: ManualRate[]): number {
  if (rates.length === 0) return 0;
  let baseIdx = 0;
  for (let i = 1; i < rates.length; i++) {
    if (rates[i].first > rates[baseIdx].first) baseIdx = i;
  }
  let cents = rates[baseIdx].first;
  for (let i = 0; i < rates.length; i++) {
    if (i !== baseIdx) cents += rates[i].addl;
  }
  return cents;
}

const RATE_COLS =
  "shipping_first_cents, shipping_addl_cents, shipping_ca_first_cents, shipping_ca_addl_cents, shipping_uk_first_cents, shipping_uk_addl_cents, shipping_row_first_cents, shipping_row_addl_cents, free_shipping_exempt";

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
  subtotalCents = 0,
): Promise<ShippingQuote> {
  const zone = zoneFor(address.country);

  const printifyLineItems: PrintifyOrderLineItem[] = [];
  const manualRates: ManualRate[] = [];
  // A Printify line whose SKU/product is free_shipping_exempt keeps the
  // Printify quote payable even on a qualifying US order.
  let printifyExempt = false;

  for (const line of cartLines) {
    if (line.t === "r") continue; // ringtone = digital

    if (line.t === "m" || line.t === "o") {
      if (!line.i) continue;
      const { data: product } = await supabase
        .from("merch")
        .select(`fulfillment, printify_product_id, ${RATE_COLS}`)
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
          if (product.free_shipping_exempt) printifyExempt = true;
          continue;
        }
        // Printify product without a resolvable variant -- treat as manual so
        // we don't drop shipping entirely; falls through to manual rates.
      }
      const rate = rateForZone(product as RateRow, zone);
      manualRates.push({ first: rate.first, addl: rate.addl, exempt: !!product.free_shipping_exempt });
      continue;
    }

    // art SKU ("p") -- always physical; rates live on art_skus.
    if (line.t === "p") {
      if (!line.sk) continue;
      const { data: sku } = await supabase
        .from("art_skus")
        .select(
          `fulfillment_method, printify_product_id, printify_variant_id, ${RATE_COLS}`,
        )
        .eq("id", line.sk)
        .single();
      if (!sku) continue;
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
        if (sku.free_shipping_exempt) printifyExempt = true;
      } else {
        const rate = rateForZone(sku as RateRow, zone);
        manualRates.push({ first: rate.first, addl: rate.addl, exempt: !!sku.free_shipping_exempt });
      }
      continue;
    }

    // release ("a") / song ("s") -- SKU drives fulfillment + format.
    if (!line.sk) continue;
    const table = line.t === "a" ? "release_skus" : "song_skus";
    const { data: sku } = await supabase
      .from(table)
      .select(
        `format, fulfillment_method, printify_product_id, printify_variant_id, ${RATE_COLS}`,
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
      if (sku.free_shipping_exempt) printifyExempt = true;
    } else {
      const rate = rateForZone(sku as RateRow, zone);
      manualRates.push({ first: rate.first, addl: rate.addl, exempt: !!sku.free_shipping_exempt });
    }
  }

  const freeEligible = zone === "us" && subtotalCents >= freeUsThresholdCents();

  // Manual: exempt lines always charge; non-exempt lines are waived when the
  // order qualifies for free US shipping. Each group is combined into its own
  // box (an overseas-sourced exempt item is a separate shipment anyway).
  const exemptManualCents = combineManual(manualRates.filter((r) => r.exempt));
  const waivableManualCents = combineManual(manualRates.filter((r) => !r.exempt));
  const manualCents = exemptManualCents + (freeEligible ? 0 : waivableManualCents);

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
  // Printify is waived on a qualifying US order unless one of its lines is
  // flagged exempt.
  const printifyCharged = freeEligible && !printifyExempt ? 0 : printifyCents;

  const amountCents = manualCents + printifyCharged;
  const freeShippingApplied =
    freeEligible &&
    (waivableManualCents > 0 || (printifyCents > 0 && !printifyExempt));

  return {
    amountCents,
    hasPrintify: printifyLineItems.length > 0,
    hasManualPhysical: manualRates.length > 0,
    printifyError,
    freeShippingApplied,
  };
}
