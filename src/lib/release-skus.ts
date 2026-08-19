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

export interface SkuGalleryImage {
  id: string;
  url: string;
  alt: string | null;
}

export interface ReleaseSkuRow {
  id: string;
  release_id: string;
  format: ReleaseFormat;
  price: number | null;
  status: SkuStatus;
  stock: number | null;
  display_order: number;
  gallery_images: SkuGalleryImage[];
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
  gallery_images: SkuGalleryImage[];
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

// Bulk-fetch the full visible gallery per SKU, ordered with the primary row
// first (one per SKU, enforced by partial unique index) then by position.
// Returns a Map<sku_id, SkuGalleryImage[]>.
async function fetchGalleryImagesForSkus(
  supabase: SupabaseClient,
  skuIds: string[],
  parentCol: "release_sku_id" | "song_sku_id",
): Promise<Map<string, SkuGalleryImage[]>> {
  const out = new Map<string, SkuGalleryImage[]>();
  if (skuIds.length === 0) return out;

  const { data } = await supabase
    .from("sku_images")
    .select(`id, ${parentCol}, url, alt, is_primary, position`)
    .in(parentCol, skuIds)
    .is("deleted_at", null)
    .eq("is_hidden", false)
    .order("is_primary", { ascending: false })
    .order("position", { ascending: true });

  for (const row of (data || []) as Array<Record<string, unknown>>) {
    const parentId = row[parentCol] as string | null;
    const url = row.url as string | null;
    if (!parentId || !url) continue;
    const arr = out.get(parentId) ?? [];
    arr.push({
      id: row.id as string,
      url,
      alt: (row.alt as string | null) ?? null,
    });
    out.set(parentId, arr);
  }
  return out;
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
  const [variantRowsRes, galleryImages] = await Promise.all([
    supabase
      .from("sku_variants")
      .select("id, release_sku_id, label, variant_slug, price_delta, status, stock, display_order")
      .in("release_sku_id", skuIds)
      .in("status", ["available", "preorder", "sold_out"]),
    fetchGalleryImagesForSkus(supabase, skuIds, "release_sku_id"),
  ]);
  const variantRows = variantRowsRes.data;

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
      gallery_images: galleryImages.get(sku.id) ?? [],
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
  const [variantRowsRes, galleryImages] = await Promise.all([
    supabase
      .from("sku_variants")
      .select("id, song_sku_id, label, variant_slug, price_delta, status, stock, display_order")
      .in("song_sku_id", skuIds)
      .in("status", ["available", "preorder", "sold_out"]),
    fetchGalleryImagesForSkus(supabase, skuIds, "song_sku_id"),
  ]);
  const variantRows = variantRowsRes.data;

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
      gallery_images: galleryImages.get(sku.id) ?? [],
      variants: variantsBySku.get(sku.id) || [],
    };
    const arr = out.get(sku.song_id) || [];
    arr.push(row);
    out.set(sku.song_id, arr);
  }
  for (const arr of out.values()) arr.sort(sortSkus);

  return out;
}

// Effective digital download paths for a purchased SKU.
export interface SkuDownloadPaths {
  mp3: string | null;
  flac: string | null;
  wav: string | null;
  aac: string | null;
}

const DL_FORMATS = ["mp3", "flac", "wav", "aac"] as const;
// Spelled out because supabase-js parses the select string at the type level;
// a computed column list degrades every row to a ParserError.
const DL_COLUMNS =
  "download_path_mp3, download_path_flac, download_path_wav, download_path_aac";

async function resolveDownloadPathsForTable(
  supabase: SupabaseClient,
  table: "release_skus" | "song_skus",
  parentCol: "release_id" | "song_id",
  skuIds: string[],
  out: Map<string, SkuDownloadPaths>,
): Promise<void> {
  const ids = [...new Set(skuIds)];
  if (ids.length === 0) return;

  const { data: purchased } = await supabase
    .from(table)
    .select(`id, ${parentCol}, ${DL_COLUMNS}`)
    .in("id", ids);

  const rows = (purchased || []) as Array<Record<string, string | null>>;
  if (rows.length === 0) return;

  // Parents needing a digital sibling: any purchased SKU missing >=1 format.
  // Physical SKUs (vinyl/cd/cassette) carry no audio, so they all qualify;
  // a fully-pathed digital SKU resolves to its own paths with no extra query.
  const parentIds = [
    ...new Set(
      rows
        .filter((r) => DL_FORMATS.some((f) => !r[`download_path_${f}`]))
        .map((r) => r[parentCol])
        .filter((v): v is string => !!v),
    ),
  ];

  const siblingByParent = new Map<string, SkuDownloadPaths>();
  if (parentIds.length > 0) {
    const { data: siblings } = await supabase
      .from(table)
      .select(`${parentCol}, ${DL_COLUMNS}`)
      .in(parentCol, parentIds)
      .eq("format", "digital");
    for (const s of (siblings || []) as Array<Record<string, string | null>>) {
      const pid = s[parentCol];
      if (!pid) continue;
      siblingByParent.set(pid, {
        mp3: s.download_path_mp3 ?? null,
        flac: s.download_path_flac ?? null,
        wav: s.download_path_wav ?? null,
        aac: s.download_path_aac ?? null,
      });
    }
  }

  for (const r of rows) {
    const pid = r[parentCol];
    const sib = pid ? siblingByParent.get(pid) : undefined;
    out.set(r.id as string, {
      mp3: r.download_path_mp3 ?? sib?.mp3 ?? null,
      flac: r.download_path_flac ?? sib?.flac ?? null,
      wav: r.download_path_wav ?? sib?.wav ?? null,
      aac: r.download_path_aac ?? sib?.aac ?? null,
    });
  }
}

// Resolve effective digital download paths for purchased SKUs, keyed by SKU id.
// A SKU's own download_path_* wins; when a format is absent (physical SKUs --
// vinyl/cd/cassette -- carry no audio), it falls back to the sibling digital
// SKU of the same release/song. This is what grants the included digital copy
// on every physical purchase. Two queries per table at most.
export async function resolveSkuDownloadPaths(
  supabase: SupabaseClient,
  releaseSkuIds: string[],
  songSkuIds: string[],
): Promise<{
  byReleaseSku: Map<string, SkuDownloadPaths>;
  bySongSku: Map<string, SkuDownloadPaths>;
}> {
  const byReleaseSku = new Map<string, SkuDownloadPaths>();
  const bySongSku = new Map<string, SkuDownloadPaths>();

  await Promise.all([
    resolveDownloadPathsForTable(
      supabase,
      "release_skus",
      "release_id",
      releaseSkuIds,
      byReleaseSku,
    ),
    resolveDownloadPathsForTable(
      supabase,
      "song_skus",
      "song_id",
      songSkuIds,
      bySongSku,
    ),
  ]);

  return { byReleaseSku, bySongSku };
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
