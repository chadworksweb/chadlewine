// Server-side helpers for fetching release/song SKUs and their variants.
// Surface to the public site: filter out discontinued; sort by display_order
// then format alphabetically. The picker UI handles the rest.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReleaseFormat, SkuStatus } from "@/lib/release-labels";

export interface SkuVariantRow {
  id: string;
  label: string;
  variant_slug: string;
  price_delta: number;
  status: SkuStatus;
  stock: number | null;
  display_order: number;
}

export interface ReleaseSkuRow {
  id: string;
  release_id: string;
  format: ReleaseFormat;
  price: number | null;
  status: SkuStatus;
  stock: number | null;
  display_order: number;
  variants: SkuVariantRow[];
}

export interface SongSkuRow {
  id: string;
  song_id: string;
  format: ReleaseFormat;
  price: number | null;
  status: SkuStatus;
  stock: number | null;
  display_order: number;
  variants: SkuVariantRow[];
}

const SELLABLE = new Set<SkuStatus>(["available", "preorder", "sold_out"]);

function sortSkus<T extends { display_order: number; format: string }>(a: T, b: T): number {
  if (a.display_order !== b.display_order) return a.display_order - b.display_order;
  return a.format.localeCompare(b.format);
}

function sortVariants(a: SkuVariantRow, b: SkuVariantRow): number {
  if (a.display_order !== b.display_order) return a.display_order - b.display_order;
  return a.label.localeCompare(b.label);
}

// Fetch sellable release SKUs (and their variants) for one or many releases.
// Returns a map keyed by release_id so callers can attach SKUs to multiple
// rows in one query.
export async function fetchReleaseSkusForIds(
  supabase: SupabaseClient,
  releaseIds: string[],
): Promise<Map<string, ReleaseSkuRow[]>> {
  const out = new Map<string, ReleaseSkuRow[]>();
  if (releaseIds.length === 0) return out;

  const { data: skuRows } = await supabase
    .from("release_skus")
    .select("id, release_id, format, price, status, stock, display_order")
    .in("release_id", releaseIds)
    .in("status", ["available", "preorder", "sold_out"]);

  const skuList = (skuRows || []) as Omit<ReleaseSkuRow, "variants">[];
  if (skuList.length === 0) return out;

  const skuIds = skuList.map((s) => s.id);
  const { data: variantRows } = await supabase
    .from("sku_variants")
    .select("id, release_sku_id, label, variant_slug, price_delta, status, stock, display_order")
    .in("release_sku_id", skuIds)
    .in("status", ["available", "preorder", "sold_out"]);

  const variantsBySku = new Map<string, SkuVariantRow[]>();
  for (const v of (variantRows || []) as Array<SkuVariantRow & { release_sku_id: string }>) {
    if (!SELLABLE.has(v.status)) continue;
    const arr = variantsBySku.get(v.release_sku_id) || [];
    arr.push({
      id: v.id,
      label: v.label,
      variant_slug: v.variant_slug,
      price_delta: Number(v.price_delta),
      status: v.status,
      stock: v.stock,
      display_order: v.display_order,
    });
    variantsBySku.set(v.release_sku_id, arr);
  }
  for (const arr of variantsBySku.values()) arr.sort(sortVariants);

  for (const sku of skuList) {
    const row: ReleaseSkuRow = {
      id: sku.id,
      release_id: sku.release_id,
      format: sku.format,
      price: sku.price === null ? null : Number(sku.price),
      status: sku.status,
      stock: sku.stock,
      display_order: sku.display_order,
      variants: variantsBySku.get(sku.id) || [],
    };
    const arr = out.get(sku.release_id) || [];
    arr.push(row);
    out.set(sku.release_id, arr);
  }
  for (const arr of out.values()) arr.sort(sortSkus);

  return out;
}

export async function fetchSongSkusForIds(
  supabase: SupabaseClient,
  songIds: string[],
): Promise<Map<string, SongSkuRow[]>> {
  const out = new Map<string, SongSkuRow[]>();
  if (songIds.length === 0) return out;

  const { data: skuRows } = await supabase
    .from("song_skus")
    .select("id, song_id, format, price, status, stock, display_order")
    .in("song_id", songIds)
    .in("status", ["available", "preorder", "sold_out"]);

  const skuList = (skuRows || []) as Omit<SongSkuRow, "variants">[];
  if (skuList.length === 0) return out;

  const skuIds = skuList.map((s) => s.id);
  const { data: variantRows } = await supabase
    .from("sku_variants")
    .select("id, song_sku_id, label, variant_slug, price_delta, status, stock, display_order")
    .in("song_sku_id", skuIds)
    .in("status", ["available", "preorder", "sold_out"]);

  const variantsBySku = new Map<string, SkuVariantRow[]>();
  for (const v of (variantRows || []) as Array<SkuVariantRow & { song_sku_id: string }>) {
    if (!SELLABLE.has(v.status)) continue;
    const arr = variantsBySku.get(v.song_sku_id) || [];
    arr.push({
      id: v.id,
      label: v.label,
      variant_slug: v.variant_slug,
      price_delta: Number(v.price_delta),
      status: v.status,
      stock: v.stock,
      display_order: v.display_order,
    });
    variantsBySku.set(v.song_sku_id, arr);
  }
  for (const arr of variantsBySku.values()) arr.sort(sortVariants);

  for (const sku of skuList) {
    const row: SongSkuRow = {
      id: sku.id,
      song_id: sku.song_id,
      format: sku.format,
      price: sku.price === null ? null : Number(sku.price),
      status: sku.status,
      stock: sku.stock,
      display_order: sku.display_order,
      variants: variantsBySku.get(sku.id) || [],
    };
    const arr = out.get(sku.song_id) || [];
    arr.push(row);
    out.set(sku.song_id, arr);
  }
  for (const arr of out.values()) arr.sort(sortSkus);

  return out;
}

// Lowest price across a SKU set (including digital). For listing cards.
// Prefers the digital SKU if it has a price; otherwise takes the min of any
// SKU price. Returns null when nothing is priced.
export function fromPriceForRelease(skus: ReleaseSkuRow[]): number | null {
  if (skus.length === 0) return null;
  const digital = skus.find((s) => s.format === "digital" && s.price !== null);
  if (digital && digital.price !== null) return digital.price;
  let min: number | null = null;
  for (const s of skus) {
    if (s.price === null) continue;
    if (min === null || s.price < min) min = s.price;
  }
  return min;
}
