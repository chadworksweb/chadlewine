/**
 * unstick-printify-publishing.ts
 *
 * One-shot fix: clears Printify's "Publishing" lock on every shop product by
 * POSTing /publishing_succeeded.json. Use after Printify products get stuck
 * because the storefront never acked the product:publish:started webhook.
 *
 * Usage:
 *   npx tsx scripts/unstick-printify-publishing.ts            # dry run
 *   npx tsx scripts/unstick-printify-publishing.ts --apply    # actually ack
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

const envPath = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  envContent.split("\n").forEach((line) => {
    const [key, ...rest] = line.split("=");
    if (key && rest.length > 0) {
      process.env[key.trim()] = rest.join("=").trim();
    }
  });
}

const APPLY = process.argv.includes("--apply");
const SITE_URL = process.env.SITE_URL || "https://chadlewine.com";
const PRINTIFY_API = "https://api.printify.com/v1";
const TOKEN = process.env.PRINTIFY_API_TOKEN;
const SHOP_ID = process.env.PRINTIFY_SHOP_ID;

if (!TOKEN || !SHOP_ID) {
  console.error("Missing PRINTIFY_API_TOKEN or PRINTIFY_SHOP_ID in .env.local");
  process.exit(1);
}

function pfHeaders() {
  return {
    Authorization: `Bearer ${TOKEN}`,
    "Content-Type": "application/json",
  };
}

interface ShopProduct {
  id: string;
  title: string;
  is_locked: boolean;
  visible: boolean;
}

async function getShopProducts(): Promise<ShopProduct[]> {
  const all: ShopProduct[] = [];
  let page = 1;
  while (true) {
    const res = await fetch(
      `${PRINTIFY_API}/shops/${SHOP_ID}/products.json?page=${page}&limit=50`,
      { headers: pfHeaders() },
    );
    if (!res.ok) {
      throw new Error(`getShopProducts ${page} → ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as { data?: ShopProduct[]; current_page?: number; last_page?: number };
    all.push(...(json.data || []));
    if (!json.last_page || page >= json.last_page) break;
    page++;
  }
  return all;
}

async function publishingSucceeded(productId: string, slug: string) {
  const res = await fetch(
    `${PRINTIFY_API}/shops/${SHOP_ID}/products/${productId}/publishing_succeeded.json`,
    {
      method: "POST",
      headers: pfHeaders(),
      body: JSON.stringify({
        external: {
          id: productId,
          handle: `${SITE_URL}/merch/${slug}`,
        },
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`publishing_succeeded ${productId} → ${res.status} ${await res.text()}`);
  }
}

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const products = await getShopProducts();
  const locked = products.filter((p) => p.is_locked);

  console.log(`Fetched ${products.length} shop products · ${locked.length} locked (Publishing).`);
  if (locked.length === 0) {
    console.log("Nothing to unstick.");
    return;
  }

  const { data: localRows } = await supabase
    .from("products")
    .select("printify_product_id, slug")
    .in("printify_product_id", locked.map((p) => p.id));

  const slugByPrintifyId = new Map<string, string>(
    (localRows || []).map((r) => [r.printify_product_id as string, r.slug as string]),
  );

  for (const p of locked) {
    const slug = slugByPrintifyId.get(p.id) || p.id;
    const handle = `${SITE_URL}/merch/${slug}`;
    if (!APPLY) {
      console.log(`[dry] would ack ${p.id}  ${p.title}  → handle=${handle}`);
      continue;
    }
    try {
      await publishingSucceeded(p.id, slug);
      console.log(`ack  ${p.id}  ${p.title}`);
    } catch (e) {
      console.error(`FAIL ${p.id}  ${p.title}  →  ${(e as Error).message}`);
    }
  }

  if (!APPLY) console.log(`\nDry run only. Re-run with --apply to ack.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
