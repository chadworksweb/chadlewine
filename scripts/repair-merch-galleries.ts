// One-off repair: re-apply Printify image galleries for every synced product
// after fixing the duplicate-key bug in applyPrintifyImagesToGallery. Idempotent.
import * as fs from "fs";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";
import { getShopProducts } from "../src/lib/printify";
import { applyPrintifyImagesToGallery, syncDerivedProductColumns } from "../src/lib/product-images";

const envPath = path.resolve(__dirname, "../.env.local");
for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const shop = await getShopProducts();
  const { data: rows } = await supabase
    .from("products")
    .select("id, printify_product_id, title")
    .not("printify_product_id", "is", null);
  const idByPrintify = new Map((rows || []).map((r) => [r.printify_product_id as string, { id: r.id as string, title: r.title as string }]));

  for (const p of shop.data || []) {
    const local = idByPrintify.get(p.id);
    if (!local) continue;
    try {
      const res = await applyPrintifyImagesToGallery(supabase, local.id, p.images);
      await syncDerivedProductColumns(supabase, local.id);
      console.log(`OK   ${local.title}  +${res.inserted} ~${res.updated} hidden=${res.hidden}`);
    } catch (e) {
      console.error(`FAIL ${local.title}  ${(e as Error).message}`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
