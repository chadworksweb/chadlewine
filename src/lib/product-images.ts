import type { SupabaseClient } from "@supabase/supabase-js";
import type { PrintifyShopProduct } from "@/lib/printify";

export interface ProductImage {
  id: string;
  product_id: string;
  url: string;
  source: "printify" | "custom";
  printify_variant_ids: number[] | null;
  printify_position: string | null;
  position: number;
  is_primary: boolean;
  is_hidden: boolean;
  needs_review: boolean;
  alt: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type GalleryImage = Pick<
  ProductImage,
  "id" | "url" | "alt" | "is_primary" | "position" | "source"
>;

// Sort variant_ids ascending — dedupe key is order-sensitive in the unique index.
export function sortVariantIds(ids: number[] | null | undefined): number[] {
  if (!ids || ids.length === 0) return [];
  return [...ids].sort((a, b) => a - b);
}

// Public-facing gallery: non-hidden, non-deleted, primary first then by position.
export async function getGalleryForProduct(
  supabase: SupabaseClient,
  productId: string,
): Promise<GalleryImage[]> {
  const { data, error } = await supabase
    .from("product_images")
    .select("id, url, alt, is_primary, position, source")
    .eq("product_id", productId)
    .eq("is_hidden", false)
    .is("deleted_at", null)
    .order("is_primary", { ascending: false })
    .order("position", { ascending: true });
  if (error) throw error;
  return (data || []) as GalleryImage[];
}

// Admin-facing: includes hidden + needs_review state for management UI.
// Excludes soft-deleted rows.
export async function getAdminGalleryForProduct(
  supabase: SupabaseClient,
  productId: string,
): Promise<ProductImage[]> {
  const { data, error } = await supabase
    .from("product_images")
    .select("*")
    .eq("product_id", productId)
    .is("deleted_at", null)
    .order("is_primary", { ascending: false })
    .order("position", { ascending: true });
  if (error) throw error;
  return (data || []) as ProductImage[];
}

// During transition, products.image_url + image_urls remain populated so legacy
// readers keep working. Recompute from gallery state and persist. Drop this
// call once the legacy columns are removed.
export async function syncDerivedProductColumns(
  supabase: SupabaseClient,
  productId: string,
): Promise<void> {
  const gallery = await getGalleryForProduct(supabase, productId);
  const heroUrl = gallery[0]?.url || null;
  const allUrls = gallery.map((g) => g.url);
  await supabase
    .from("products")
    .update({ image_url: heroUrl, image_urls: allUrls })
    .eq("id", productId);
}

// Apply Printify-side image state to product_images, respecting the firewall:
//   - Match existing rows by (sorted variant_ids[], position string)
//   - Update url in place; never touch position/is_primary/is_hidden/needs_review
//   - Append net-new mockups at the end with needs_review=true
//   - Mark missing-upstream Printify rows as is_hidden=true (don't delete)
//   - Never touch source='custom' or pre-existing is_hidden=true rows
//
// Returns counts so the caller can report sync deltas.
export async function applyPrintifyImagesToGallery(
  supabase: SupabaseClient,
  productId: string,
  printifyImages: PrintifyShopProduct["images"],
): Promise<{ inserted: number; updated: number; hidden: number }> {
  const { data: existingRows, error: fetchErr } = await supabase
    .from("product_images")
    .select("*")
    .eq("product_id", productId)
    .eq("source", "printify")
    .is("deleted_at", null);
  if (fetchErr) throw fetchErr;
  const existing = (existingRows || []) as ProductImage[];

  // Index existing rows by dedupe key. Skip rows with null keys (Phase 1
  // backfill that hasn't been re-keyed yet) — they'll be matched by URL
  // fallback in the Phase 2 script, not here.
  const keyOf = (variant_ids: number[] | null, position: string | null) =>
    variant_ids && position
      ? `${sortVariantIds(variant_ids).join(",")}::${position}`
      : null;

  const byKey = new Map<string, ProductImage>();
  for (const row of existing) {
    const k = keyOf(row.printify_variant_ids, row.printify_position);
    if (k) byKey.set(k, row);
  }

  // Track which existing rows were seen in the upstream payload so we can
  // hide the rest. is_hidden=true rows stay untouched (firewall).
  const seenIds = new Set<string>();

  const { data: maxRow } = await supabase
    .from("product_images")
    .select("position")
    .eq("product_id", productId)
    .is("deleted_at", null)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  let nextPosition = ((maxRow?.position as number | undefined) ?? -1) + 1;

  let inserted = 0;
  let updated = 0;
  let hidden = 0;

  for (const img of printifyImages || []) {
    if (!img.src) continue;
    const variantIds = img.variant_ids ?? null;
    const position = img.position ?? null;
    const k = keyOf(variantIds, position);
    if (!k) continue; // Printify payload missing variant_ids or position — skip; this image is unkeyable.

    const match = byKey.get(k);
    if (match) {
      seenIds.add(match.id);
      // Don't disturb hidden rows — firewall rule.
      if (match.is_hidden) continue;
      if (match.url !== img.src) {
        const { error } = await supabase
          .from("product_images")
          .update({ url: img.src, updated_at: new Date().toISOString() })
          .eq("id", match.id);
        if (error) throw error;
        updated++;
      }
    } else {
      const { error } = await supabase.from("product_images").insert({
        product_id: productId,
        url: img.src,
        source: "printify",
        printify_variant_ids: sortVariantIds(variantIds),
        printify_position: position,
        position: nextPosition++,
        needs_review: true,
      });
      if (error) throw error;
      inserted++;
    }
  }

  // Hide rows present in DB but missing from upstream — never delete.
  for (const row of existing) {
    if (seenIds.has(row.id)) continue;
    if (row.is_hidden) continue;
    if (!row.printify_variant_ids || !row.printify_position) continue; // Phase 1 row, leave alone.
    const { error } = await supabase
      .from("product_images")
      .update({ is_hidden: true, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    if (error) throw error;
    hidden++;
  }

  return { inserted, updated, hidden };
}
