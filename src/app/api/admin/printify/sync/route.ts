import { createAdminClient } from "@/lib/supabase-server";
import { getShopProducts, type PrintifyShopProduct } from "@/lib/printify";
import { slugify } from "@/lib/utils";

interface NormalizedVariant {
  id: number;
  title: string;
  size: string | null;
  color: string | null;
  price_cents: number;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function pickImage(p: PrintifyShopProduct): string | null {
  const def = p.images.find((i) => i.is_default);
  return def?.src || p.images[0]?.src || null;
}

function normalizeVariants(p: PrintifyShopProduct): NormalizedVariant[] {
  // Build a value-id → { name, value } lookup so we can resolve
  // variant.options[] back to size/color labels.
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
    // Fallback: derive size from variant.title like "Royal Caribe / M".
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

export async function POST() {
  // Quick env presence check — surface root cause loudly when a key is missing
  // or has whitespace baggage from a CLI paste.
  const rawToken = process.env.PRINTIFY_API_TOKEN || "";
  const rawShop = process.env.PRINTIFY_SHOP_ID || "";
  if (!rawToken || !rawShop) {
    return Response.json({
      error: `Printify env not set (token_present=${!!rawToken}, shop_present=${!!rawShop})`,
    }, { status: 500 });
  }
  const tokenTrimmedLen = rawToken.trim().length;
  const shopTrimmedLen = rawShop.trim().length;
  if (tokenTrimmedLen !== rawToken.length || shopTrimmedLen !== rawShop.length) {
    return Response.json({
      error: `Printify env has surrounding whitespace (token_len=${rawToken.length} trimmed=${tokenTrimmedLen}, shop_len=${rawShop.length} trimmed=${shopTrimmedLen}). Re-add via vercel env to clean it up.`,
    }, { status: 500 });
  }

  let shopProducts;
  try {
    shopProducts = await getShopProducts();
  } catch (err) {
    return Response.json({
      error: (err as Error).message,
      hint: `shop=${rawShop.slice(0, 12)}, token_len=${rawToken.length}, token_prefix=${rawToken.slice(0, 12)}`,
    }, { status: 502 });
  }

  const supabase = createAdminClient();
  const nowIso = new Date().toISOString();

  let created = 0;
  let updated = 0;
  const errors: Array<{ printify_id: string; error: string }> = [];

  for (const p of shopProducts.data || []) {
    const variants = normalizeVariants(p);
    if (variants.length === 0) continue;
    const lowestCents = Math.min(...variants.map((v) => v.price_cents));
    const price = lowestCents / 100;

    const { data: existing } = await supabase
      .from("products")
      .select("id, tier, slug")
      .eq("printify_product_id", p.id)
      .maybeSingle();

    const baseSlug = slugify(p.title);
    let slug = existing?.slug || baseSlug;
    if (!existing?.slug) {
      // First-time sync — pick a non-colliding slug. Append -2, -3, ... if taken
      // by another product (sub-range of total products is tiny so this loop is
      // bounded by a couple of tries in practice).
      let n = 2;
      while (true) {
        const { data: clash } = await supabase
          .from("products")
          .select("id")
          .eq("slug", slug)
          .maybeSingle();
        if (!clash) break;
        slug = `${baseSlug}-${n++}`;
        if (n > 50) break;
      }
    }

    const payload = {
      printify_product_id: p.id,
      title: p.title,
      slug,
      description: stripHtml(p.description || ""),
      image_url: pickImage(p),
      price,
      variants,
      fulfillment: "printify_curated",
      status: p.visible ? "active" : "inactive",
      last_synced_at: nowIso,
    };

    if (existing) {
      const { error } = await supabase
        .from("products")
        .update(payload)
        .eq("id", existing.id);
      if (error) errors.push({ printify_id: p.id, error: error.message });
      else updated++;
    } else {
      const { error } = await supabase
        .from("products")
        .insert({ ...payload, tier: "line" });
      if (error) errors.push({ printify_id: p.id, error: error.message });
      else created++;
    }
  }

  return Response.json({
    ok: errors.length === 0,
    fetched: shopProducts.data?.length || 0,
    created,
    updated,
    errors,
  });
}
