// Field shape + normalization for art_skus rows. Parallel to sku-fields.ts
// (song/release SKUs), but art has its own format set (original, limited_print),
// a sale_mode (buy_now | inquire), edition counters, and a COA flag instead of
// digital download paths. Shipping columns match song_skus exactly so the
// shared shipping calculator works against art SKUs unchanged.

export const ART_SKU_FIELDS = [
  "format",
  "fulfillment_method",
  "sale_mode",
  "sku_code",
  "price",
  "status",
  "stock",
  "edition_size",
  "editions_sold",
  "coa_enabled",
  "weight_grams",
  "ships_in_days",
  "shipping_first_cents",
  "shipping_addl_cents",
  "shipping_ca_first_cents",
  "shipping_ca_addl_cents",
  "shipping_uk_first_cents",
  "shipping_uk_addl_cents",
  "shipping_row_first_cents",
  "shipping_row_addl_cents",
  "free_shipping_exempt",
  "printify_product_id",
  "printify_variant_id",
  "display_order",
] as const;

export type ArtSkuField = (typeof ART_SKU_FIELDS)[number];

const NUMERIC_FIELDS = new Set<ArtSkuField>(["price"]);
const INTEGER_FIELDS = new Set<ArtSkuField>([
  "stock",
  "edition_size",
  "editions_sold",
  "display_order",
  "weight_grams",
  "ships_in_days",
  "shipping_first_cents",
  "shipping_addl_cents",
  "shipping_ca_first_cents",
  "shipping_ca_addl_cents",
  "shipping_uk_first_cents",
  "shipping_uk_addl_cents",
  "shipping_row_first_cents",
  "shipping_row_addl_cents",
]);
const BOOLEAN_FIELDS = new Set<ArtSkuField>(["coa_enabled", "free_shipping_exempt"]);
const TEXT_NULLABLE_FIELDS = new Set<ArtSkuField>([
  "sku_code",
  "printify_product_id",
  "printify_variant_id",
]);

const ALLOWED_FORMATS = new Set(["original", "limited_print"]);
const ALLOWED_FULFILLMENT = new Set(["manual", "printify"]);
const ALLOWED_SALE_MODE = new Set(["buy_now", "inquire"]);
const ALLOWED_STATUS = new Set([
  "available",
  "reserved",
  "sold",
  "preorder",
  "discontinued",
]);

export function pickArtSkuFields(body: Record<string, unknown>): {
  updates: Record<string, unknown>;
  error: string | null;
} {
  const updates: Record<string, unknown> = {};

  for (const f of ART_SKU_FIELDS) {
    if (!(f in body)) continue;
    const raw = body[f];

    if (raw === null || raw === "") {
      if (f === "format" || f === "fulfillment_method" || f === "sale_mode" || f === "status") {
        return { updates, error: `${f} cannot be empty` };
      }
      if (f === "display_order" || f === "edition_size" || f === "editions_sold") {
        updates[f] = 0;
        continue;
      }
      if (f === "coa_enabled") {
        updates[f] = true;
        continue;
      }
      if (BOOLEAN_FIELDS.has(f)) {
        updates[f] = false;
        continue;
      }
      updates[f] = null;
      continue;
    }

    if (f === "format") {
      const v = String(raw);
      if (!ALLOWED_FORMATS.has(v)) return { updates, error: "invalid format" };
      updates[f] = v;
      continue;
    }
    if (f === "fulfillment_method") {
      const v = String(raw);
      if (!ALLOWED_FULFILLMENT.has(v)) return { updates, error: "invalid fulfillment_method" };
      updates[f] = v;
      continue;
    }
    if (f === "sale_mode") {
      const v = String(raw);
      if (!ALLOWED_SALE_MODE.has(v)) return { updates, error: "invalid sale_mode" };
      updates[f] = v;
      continue;
    }
    if (f === "status") {
      const v = String(raw);
      if (!ALLOWED_STATUS.has(v)) return { updates, error: "invalid status" };
      updates[f] = v;
      continue;
    }
    if (NUMERIC_FIELDS.has(f)) {
      const num = typeof raw === "number" ? raw : parseFloat(String(raw));
      if (!isFinite(num)) return { updates, error: `${f} must be numeric` };
      updates[f] = num;
      continue;
    }
    if (INTEGER_FIELDS.has(f)) {
      const num = typeof raw === "number" ? Math.trunc(raw) : parseInt(String(raw), 10);
      if (!isFinite(num)) return { updates, error: `${f} must be an integer` };
      updates[f] = num;
      continue;
    }
    if (BOOLEAN_FIELDS.has(f)) {
      updates[f] = raw === true || raw === "true" || raw === 1 || raw === "1";
      continue;
    }
    if (TEXT_NULLABLE_FIELDS.has(f)) {
      const v = String(raw).trim();
      updates[f] = v.length === 0 ? null : v;
      continue;
    }
  }

  // An original is intrinsically 1 of 1. Enforce it server-side so the UI can
  // hide the field without risking a bad write.
  if (updates.format === "original") {
    updates.edition_size = 1;
  }

  return { updates, error: null };
}
