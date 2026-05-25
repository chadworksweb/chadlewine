import type { SupabaseClient } from "@supabase/supabase-js";
import { getShopProducts, type PrintifyShopProduct } from "@/lib/printify";
import { slugify } from "@/lib/utils";
import {
  applyPrintifyImagesToGallery,
  syncDerivedProductColumns,
} from "@/lib/product-images";

interface NormalizedVariant {
  id: number;
  title: string;
  size: string | null;
  color: string | null;
  price_cents: number;
}

export interface SyncResult {
  ok: boolean;
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ printify_id: string; error: string }>;
  hint?: string;
  error?: string;
}

// Per-field allow list for updates. Maps to Printify's publish-checkbox flags.
// New products are always inserted with all fields regardless of this map.
export interface SyncFieldFlags {
  title?: boolean;
  description?: boolean;
  images?: boolean;   // image_url + image_urls
  variants?: boolean; // variants + price (price is derived from variants)
}

export interface SyncOptions {
  // If omitted, existing rows are skipped entirely (insert-only mode for the
  // manual sync button). If provided, only the listed fields update.
  fields?: SyncFieldFlags;
  // Scope to a single Printify product (used by the publish-started webhook).
  onlyPrintifyId?: string;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function pickImage(p: PrintifyShopProduct): string | null {
  const def = p.images.find((i) => i.is_default);
  return def?.src || p.images[0]?.src || null;
}

function collectImages(p: PrintifyShopProduct): string[] {
  // Default first so the gallery thumbnail order matches the hero image,
  // remainder in Printify's array order, deduped on src.
  const seen = new Set<string>();
  const out: string[] = [];
  const def = p.images.find((i) => i.is_default);
  if (def?.src) {
    seen.add(def.src);
    out.push(def.src);
  }
  for (const img of p.images) {
    if (!img.src || seen.has(img.src)) continue;
    seen.add(img.src);
    out.push(img.src);
  }
  return out;
}

function normalizeVariants(p: PrintifyShopProduct): NormalizedVariant[] {
  const valueLookup = new Map<number, { groupName: string; label: string }>();
  for (const group of p.options || []) {
    for (const v of group.values) {
      valueLookup.set(v.id, { groupName: group.name, label: v.title });
    }
  }

  const enabled = p.variants.filter((v) => v.is_enabled);
  return enabled.map((v) => {
    let size: string | null = null;
    let color: string | null = null;
    for (const optionId of v.options || []) {
      const meta = valueLookup.get(optionId);
      if (!meta) continue;
      const n = meta.groupName.toLowerCase();
      if (n.includes("size")) size = meta.label;
      else if (n.includes("color")) color = meta.label;
    }
    if (!size && v.title.includes(" / ")) {
      const parts = v.title.split(" / ").map((s) => s.trim());
      if (parts.length === 2) {
        color = color || parts[0];
        size = parts[1];
      }
    }
    return {
      id: v.id,
      title: v.title,
      size,
      color,
      price_cents: v.price,
    };
  });
}

export async function syncPrintifyProducts(
  supabase: SupabaseClient,
  options: SyncOptions = {},
): Promise<SyncResult> {
  const rawToken = process.env.PRINTIFY_API_TOKEN || "";
  const rawShop = process.env.PRINTIFY_SHOP_ID || "";
  if (!rawToken || !rawShop) {
    return {
      ok: false,
      fetched: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
      error: `Printify env not set (token_present=${!!rawToken}, shop_present=${!!rawShop})`,
    };
  }
  if (rawToken.trim().length !== rawToken.length || rawShop.trim().length !== rawShop.length) {
    return {
      ok: false,
      fetched: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
      error: `Printify env has surrounding whitespace. Re-add via vercel env to clean it up.`,
    };
  }

  let shopProducts;
  try {
    shopProducts = await getShopProducts();
  } catch (err) {
    return {
      ok: false,
      fetched: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
      error: (err as Error).message,
      hint: `shop=${rawShop.slice(0, 12)}, token_len=${rawToken.length}, token_prefix=${rawToken.slice(0, 12)}`,
    };
  }

  const nowIso = new Date().toISOString();
  const fields = options.fields;
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: Array<{ printify_id: string; error: string }> = [];

  for (const p of shopProducts.data || []) {
    if (options.onlyPrintifyId && p.id !== options.onlyPrintifyId) continue;

    const variants = normalizeVariants(p);
    if (variants.length === 0) continue;
    const lowestCents = Math.min(...variants.map((v) => v.price_cents));
    const price = lowestCents / 100;

    const { data: existing } = await supabase
      .from("merch")
      .select("id, tier, slug")
      .eq("printify_product_id", p.id)
      .maybeSingle();

    if (existing) {
      // No fields = insert-only mode → leave existing row untouched.
      if (!fields) {
        skipped++;
        continue;
      }

      const updatePayload: Record<string, unknown> = {
        last_synced_at: nowIso,
        // Visibility isn't a Printify checkbox; treat it as always synced when
        // we're updating anything at all.
        status: p.visible ? "active" : "inactive",
      };
      if (fields.title) updatePayload.title = p.title;
      if (fields.description) updatePayload.description = stripHtml(p.description || "");
      if (fields.variants) {
        updatePayload.variants = variants;
        updatePayload.price = price;
      }

      const { error } = await supabase
        .from("merch")
        .update(updatePayload)
        .eq("id", existing.id);
      if (error) {
        errors.push({ printify_id: p.id, error: error.message });
        continue;
      }

      if (fields.images) {
        try {
          await applyPrintifyImagesToGallery(supabase, existing.id, p.images);
          await syncDerivedProductColumns(supabase, existing.id);
        } catch (err) {
          errors.push({ printify_id: p.id, error: (err as Error).message });
          continue;
        }
      }
      updated++;
    } else {
      // New product: pick a slug and insert with everything.
      const baseSlug = slugify(p.title);
      let slug = baseSlug;
      let n = 2;
      while (true) {
        const { data: clash } = await supabase
          .from("merch")
          .select("id")
          .eq("slug", slug)
          .maybeSingle();
        if (!clash) break;
        slug = `${baseSlug}-${n++}`;
        if (n > 50) break;
      }

      const insertPayload = {
        printify_product_id: p.id,
        title: p.title,
        slug,
        description: stripHtml(p.description || ""),
        image_url: pickImage(p),
        image_urls: collectImages(p),
        price,
        variants,
        fulfillment: "printify_curated",
        status: p.visible ? "active" : "inactive",
        last_synced_at: nowIso,
        // tier retired as a category (migration 20260523000000); leave null.
        tier: null,
      };

      const { data: insertedRows, error } = await supabase
        .from("merch")
        .insert(insertPayload)
        .select("id")
        .single();
      if (error || !insertedRows) {
        errors.push({ printify_id: p.id, error: error?.message || "insert returned no row" });
        continue;
      }

      try {
        await applyPrintifyImagesToGallery(supabase, insertedRows.id, p.images);
        await syncDerivedProductColumns(supabase, insertedRows.id);
      } catch (err) {
        errors.push({ printify_id: p.id, error: (err as Error).message });
        continue;
      }
      created++;
    }
  }

  return {
    ok: errors.length === 0,
    fetched: shopProducts.data?.length || 0,
    created,
    updated,
    skipped,
    errors,
  };
}
