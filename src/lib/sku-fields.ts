// Shared shape + normalization for release_skus and song_skus rows. The two
// tables are parallel; this keeps the admin API handlers terse.

export const SKU_BASE_FIELDS = [
  "format",
  "fulfillment_method",
  "sku_code",
  "price",
  "status",
  "stock",
  "display_order",
  "download_path_mp3",
  "download_path_flac",
  "download_path_wav",
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
] as const;

export type SkuBaseField = (typeof SKU_BASE_FIELDS)[number];

const NUMERIC_FIELDS = new Set<SkuBaseField>(["price"]);
const INTEGER_FIELDS = new Set<SkuBaseField>([
  "stock",
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
const BOOLEAN_FIELDS = new Set<SkuBaseField>(["free_shipping_exempt"]);
const TEXT_NULLABLE_FIELDS = new Set<SkuBaseField>([
  "sku_code",
  "download_path_mp3",
  "download_path_flac",
  "download_path_wav",
  "printify_product_id",
  "printify_variant_id",
]);

const ALLOWED_FORMATS = new Set(["digital", "vinyl", "cd", "cassette"]);
const ALLOWED_FULFILLMENT = new Set(["manual", "printify"]);
const ALLOWED_STATUS = new Set([
  "available",
  "preorder",
  "sold_out",
  "discontinued",
]);

export function pickSkuFields(body: Record<string, unknown>): {
  updates: Record<string, unknown>;
  error: string | null;
} {
  const updates: Record<string, unknown> = {};

  for (const f of SKU_BASE_FIELDS) {
    if (!(f in body)) continue;
    const raw = body[f];

    if (raw === null || raw === "") {
      if (f === "format" || f === "fulfillment_method" || f === "status") {
        return { updates, error: `${f} cannot be empty` };
      }
      if (f === "display_order") {
        updates[f] = 0;
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
      if (!ALLOWED_FULFILLMENT.has(v)) {
        return { updates, error: "invalid fulfillment_method" };
      }
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
      const n = typeof raw === "number" ? raw : parseFloat(String(raw));
      if (!isFinite(n)) return { updates, error: `${f} must be numeric` };
      updates[f] = n;
      continue;
    }
    if (INTEGER_FIELDS.has(f)) {
      const n =
        typeof raw === "number"
          ? Math.trunc(raw)
          : parseInt(String(raw), 10);
      if (!isFinite(n)) return { updates, error: `${f} must be an integer` };
      updates[f] = n;
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

  return { updates, error: null };
}

export const VARIANT_FIELDS = [
  "label",
  "variant_slug",
  "sku_code",
  "price_delta",
  "status",
  "stock",
  "display_order",
] as const;

export type VariantField = (typeof VARIANT_FIELDS)[number];

export function pickVariantFields(body: Record<string, unknown>): {
  updates: Record<string, unknown>;
  error: string | null;
} {
  const updates: Record<string, unknown> = {};

  for (const f of VARIANT_FIELDS) {
    if (!(f in body)) continue;
    const raw = body[f];

    if (raw === null || raw === "") {
      if (f === "label" || f === "variant_slug" || f === "status") {
        return { updates, error: `${f} cannot be empty` };
      }
      if (f === "price_delta") {
        updates[f] = 0;
        continue;
      }
      if (f === "display_order") {
        updates[f] = 0;
        continue;
      }
      updates[f] = null;
      continue;
    }

    if (f === "status") {
      const v = String(raw);
      if (!ALLOWED_STATUS.has(v)) return { updates, error: "invalid status" };
      updates[f] = v;
      continue;
    }
    if (f === "price_delta") {
      const n = typeof raw === "number" ? raw : parseFloat(String(raw));
      if (!isFinite(n)) return { updates, error: "price_delta must be numeric" };
      updates[f] = n;
      continue;
    }
    if (f === "stock" || f === "display_order") {
      const n =
        typeof raw === "number"
          ? Math.trunc(raw)
          : parseInt(String(raw), 10);
      if (!isFinite(n)) return { updates, error: `${f} must be an integer` };
      updates[f] = n;
      continue;
    }
    if (f === "label" || f === "variant_slug" || f === "sku_code") {
      const v = String(raw).trim();
      updates[f] = v.length === 0 ? null : v;
      continue;
    }
  }

  return { updates, error: null };
}
