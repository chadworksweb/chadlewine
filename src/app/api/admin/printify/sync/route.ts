import { createAdminClient } from "@/lib/supabase-server";
import { getShopProducts, type PrintifyShopProduct } from "@/lib/printify";

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
  let shopProducts;
  try {
    shopProducts = await getShopProducts();
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
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
      .select("id, tier")
      .eq("printify_product_id", p.id)
      .maybeSingle();

    const payload = {
      printify_product_id: p.id,
      title: p.title,
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
