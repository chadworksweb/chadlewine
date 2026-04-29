/**
 * bg-remove-merch-all.ts
 *
 * Find every product whose image_url (or any image_urls entry) still points
 * at images-api.printify.com, then process each via processProduct().
 *
 * Usage:
 *   npx tsx scripts/bg-remove-merch-all.ts            # dry: list slugs + dry per-product
 *   npx tsx scripts/bg-remove-merch-all.ts --apply    # process + upload + DB
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import { processProduct } from "./bg-remove-merch-images";

const envPath = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf-8")
    .split("\n")
    .forEach((line) => {
      const [k, ...rest] = line.split("=");
      if (k && rest.length > 0) process.env[k.trim()] = rest.join("=").trim();
    });
}

const APPLY = process.argv.includes("--apply");

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data, error } = await supabase
    .from("products")
    .select("id, slug, title, image_url, image_urls")
    .not("slug", "is", null);
  if (error) throw error;
  if (!data) throw new Error("no products");

  const matches = data.filter((p) => {
    const all = [p.image_url, ...(p.image_urls || [])].filter(Boolean) as string[];
    return all.some((u) => u.includes("images-api.printify.com"));
  });

  console.log(`Found ${matches.length} products with Printify URLs.`);

  let ok = 0;
  let fail = 0;
  for (let i = 0; i < matches.length; i++) {
    const p = matches[i];
    console.log(`\n=== [${i + 1}/${matches.length}] ===`);
    try {
      await processProduct(p.slug!, APPLY);
      ok++;
    } catch (e) {
      fail++;
      console.error(`!! Failed for ${p.slug}: ${(e as Error).message}`);
    }
  }

  console.log(`\nDone. ${ok} ok, ${fail} failed.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
