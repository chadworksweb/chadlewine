/**
 * backfill-merch-image-keys.ts
 *
 * Phase 2 of the merch gallery migration. The migration's Phase 1 SQL copied
 * existing products.image_url + image_urls into product_images rows with null
 * dedupe keys (printify_variant_ids, printify_position). This script fills
 * those keys by re-fetching from Printify and matching by URL.
 *
 * Run once after `20260501120000_create_product_images.sql` is applied.
 *
 * Usage:
 *   npx tsx scripts/backfill-merch-image-keys.ts            # dry run
 *   npx tsx scripts/backfill-merch-image-keys.ts --apply    # write keys
 */
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

const envPath = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf-8").split("\n").forEach((line) => {
    const [k, ...rest] = line.split("=");
    if (k && rest.length > 0 && !(k.trim() in process.env)) {
      process.env[k.trim()] = rest.join("=").trim();
    }
  });
}

const APPLY = process.argv.includes("--apply");

const PRINTIFY_API = "https://api.printify.com/v1";
const PRINTIFY_TOKEN = process.env.PRINTIFY_API_TOKEN!;
const PRINTIFY_SHOP_ID = process.env.PRINTIFY_SHOP_ID!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!PRINTIFY_TOKEN || !PRINTIFY_SHOP_ID) {
  console.error("Missing PRINTIFY_API_TOKEN or PRINTIFY_SHOP_ID");
  process.exit(1);
}
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

interface PrintifyImage {
  src: string;
  variant_ids?: number[];
  position?: string;
  is_default?: boolean;
}

interface PrintifyProduct {
  id: string;
  images: PrintifyImage[];
}

interface ProductImageRow {
  id: string;
  product_id: string;
  url: string;
  source: string;
  printify_variant_ids: number[] | null;
  printify_position: string | null;
}

function sortVariantIds(ids: number[] | undefined): number[] {
  if (!ids || ids.length === 0) return [];
  return [...ids].sort((a, b) => a - b);
}

async function getShopProducts(): Promise<PrintifyProduct[]> {
  const res = await fetch(
    `${PRINTIFY_API}/shops/${PRINTIFY_SHOP_ID}/products.json`,
    { headers: { Authorization: `Bearer ${PRINTIFY_TOKEN}` } },
  );
  if (!res.ok) throw new Error(`Printify error: ${res.status}`);
  const json = (await res.json()) as { data?: PrintifyProduct[] };
  return json.data || [];
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  console.log(APPLY ? "[apply mode]" : "[dry run — pass --apply to write]");

  const printifyProducts = await getShopProducts();
  console.log(`Fetched ${printifyProducts.length} Printify products`);

  let totalKeyed = 0;
  let totalUnmatched = 0;
  let totalSkippedAlreadyKeyed = 0;

  for (const pp of printifyProducts) {
    const { data: localProduct } = await supabase
      .from("products")
      .select("id, title")
      .eq("printify_product_id", pp.id)
      .maybeSingle();
    if (!localProduct) {
      console.log(`  - skip ${pp.id}: no local product row`);
      continue;
    }

    const { data: rowsRaw } = await supabase
      .from("product_images")
      .select("id, product_id, url, source, printify_variant_ids, printify_position")
      .eq("product_id", localProduct.id)
      .eq("source", "printify")
      .is("deleted_at", null);
    const rows = (rowsRaw || []) as ProductImageRow[];

    if (rows.length === 0) {
      console.log(`  - ${localProduct.title}: no rows`);
      continue;
    }

    // URL → row index, only for rows that still need a key.
    const byUrl = new Map<string, ProductImageRow>();
    for (const r of rows) {
      if (r.printify_variant_ids && r.printify_position) continue;
      byUrl.set(r.url, r);
    }

    let keyedThisProduct = 0;
    for (const img of pp.images || []) {
      if (!img.src || !img.variant_ids || !img.position) continue;
      const row = byUrl.get(img.src);
      if (!row) continue;

      const sortedIds = sortVariantIds(img.variant_ids);
      console.log(
        `  + ${localProduct.title} :: ${row.id.slice(0, 8)} → variant_ids=[${sortedIds.join(",")}] position=${img.position}`,
      );
      if (APPLY) {
        const { error } = await supabase
          .from("product_images")
          .update({
            printify_variant_ids: sortedIds,
            printify_position: img.position,
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        if (error) {
          console.error(`    ! update error: ${error.message}`);
          continue;
        }
      }
      keyedThisProduct++;
      byUrl.delete(img.src);
    }

    const alreadyKeyedCount = rows.filter(
      (r) => r.printify_variant_ids && r.printify_position,
    ).length;
    totalSkippedAlreadyKeyed += alreadyKeyedCount;
    totalKeyed += keyedThisProduct;
    totalUnmatched += byUrl.size;

    if (byUrl.size > 0) {
      console.log(
        `  ? ${localProduct.title}: ${byUrl.size} row(s) had no Printify URL match (likely deleted upstream — leave with null keys, normal sync will hide them)`,
      );
    }
  }

  console.log("");
  console.log("Summary:");
  console.log(`  keyed:                ${totalKeyed}`);
  console.log(`  already had keys:     ${totalSkippedAlreadyKeyed}`);
  console.log(`  unmatched (orphans):  ${totalUnmatched}`);
  if (!APPLY) console.log("\n(Pass --apply to persist the changes.)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
