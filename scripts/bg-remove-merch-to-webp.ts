/**
 * bg-remove-merch-to-webp.ts
 *
 * Find every product_images row still pointing at images-api.printify.com,
 * download the white-background mockup, run rembg for transparency, convert
 * the result to .webp via sharp, upload to the Bunny site-images zone, and
 * rewrite product_images.url. After each product, sync the legacy
 * merch.image_url + image_urls columns from the gallery so the storefront
 * listing reflects the new transparent webp.
 *
 * Usage:
 *   npx tsx scripts/bg-remove-merch-to-webp.ts            # dry run
 *   npx tsx scripts/bg-remove-merch-to-webp.ts --apply    # download + rembg + webp + upload + DB
 *
 * Original printify mockups are cached in scripts/bg-remove-work/<slug>/originals/,
 * transparent PNGs in .../transparent/, final webps in .../webp/. The cache
 * means reruns are cheap.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import sharp from "sharp";

function loadEnv() {
  const envPath = path.resolve(__dirname, "../.env.local");
  if (!fs.existsSync(envPath)) return;
  fs.readFileSync(envPath, "utf-8").split("\n").forEach((line) => {
    const [k, ...rest] = line.split("=");
    if (k && rest.length) process.env[k.trim()] = rest.join("=").trim();
  });
}
loadEnv();

const STORAGE_HOSTNAME = process.env.BUNNY_STORAGE_HOSTNAME ?? "ny.storage.bunnycdn.com";
const STORAGE_ZONE = process.env.BUNNY_STORAGE_ZONE_SITE_IMAGES!;
const STORAGE_PW = process.env.BUNNY_STORAGE_ZONE_SITE_IMAGES_PASSWORD!;
const PULL_ZONE = (process.env.NEXT_PUBLIC_BUNNY_PULL_ZONE_SITE_IMAGES || "").replace(/\/$/, "");

let _supabase: SupabaseClient | null = null;
function db(): SupabaseClient {
  if (_supabase) return _supabase;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !key) throw new Error("Missing Supabase env");
  _supabase = createClient(url, key);
  return _supabase;
}

function fileNameFromUrl(url: string, position: number): string {
  const u = new URL(url);
  const base = path.basename(u.pathname);
  const stem = base.replace(/\.[^.]+$/, "");
  const cam = u.searchParams.get("camera_label") || "";
  const camPart = cam ? `__${cam.replace(/[^a-z0-9-]+/gi, "-")}` : "";
  return `${String(position).padStart(2, "0")}__${stem}${camPart}`;
}

async function download(url: string, dest: string): Promise<number> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  return buf.length;
}

function rembg(inFile: string, outFile: string) {
  execFileSync("rembg", ["i", inFile, outFile], { stdio: "inherit" });
}

async function pngToWebp(pngPath: string, webpPath: string) {
  await sharp(pngPath)
    .webp({ quality: 92, alphaQuality: 100, effort: 5 })
    .toFile(webpPath);
}

async function uploadToBunny(localPath: string, remotePath: string): Promise<string> {
  if (!STORAGE_ZONE || !STORAGE_PW || !PULL_ZONE) throw new Error("Missing Bunny site-images env");
  const buf = fs.readFileSync(localPath);
  const url = `https://${STORAGE_HOSTNAME}/${STORAGE_ZONE}/${remotePath}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { AccessKey: STORAGE_PW, "Content-Type": "image/webp" },
    body: buf,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`PUT ${url} -> ${res.status} ${txt}`);
  }
  return `${PULL_ZONE}/${remotePath}`;
}

async function syncMerchColumns(productId: string) {
  // Mirror src/lib/product-images.ts:syncDerivedProductColumns. Recompute
  // image_url + image_urls from the public-visible gallery rows.
  const { data } = await db()
    .from("product_images")
    .select("url, is_primary, position, is_hidden, deleted_at")
    .eq("product_id", productId)
    .eq("is_hidden", false)
    .is("deleted_at", null)
    .order("is_primary", { ascending: false })
    .order("position", { ascending: true });
  const rows = (data || []) as { url: string }[];
  const heroUrl = rows[0]?.url || null;
  const allUrls = rows.map((r) => r.url);
  await db().from("merch").update({ image_url: heroUrl, image_urls: allUrls }).eq("id", productId);
}

async function main() {
  const APPLY = process.argv.includes("--apply");
  console.log(`[${APPLY ? "APPLY" : "DRY"}] bg-remove printify mockups -> transparent webp`);

  // Pull all rows + their merch slug for naming.
  const { data: rows, error } = await db()
    .from("product_images")
    .select("id, product_id, url, position, printify_position, is_hidden, merch:merch!inner(slug, title)")
    .ilike("url", "%images-api.printify.com%")
    .is("deleted_at", null)
    .order("product_id");
  if (error) throw error;

  type Row = {
    id: string;
    product_id: string;
    url: string;
    position: number;
    printify_position: string | null;
    is_hidden: boolean;
    merch: { slug: string; title: string } | null;
  };
  const all = ((rows as unknown) as Row[] | null) || [];
  if (all.length === 0) {
    console.log("Nothing to do.");
    return;
  }
  console.log(`Found ${all.length} printify-URL rows across ${new Set(all.map((r) => r.product_id)).size} products.`);

  // Group by product so we can sync merch columns after each product completes.
  const byProduct = new Map<string, Row[]>();
  for (const r of all) {
    const arr = byProduct.get(r.product_id) || [];
    arr.push(r);
    byProduct.set(r.product_id, arr);
  }

  let okImages = 0;
  let failImages = 0;
  let productIndex = 0;

  for (const [productId, group] of byProduct.entries()) {
    productIndex++;
    const slug = group[0].merch?.slug || productId;
    console.log(`\n=== [${productIndex}/${byProduct.size}] ${slug}  (${group.length} images) ===`);

    const workDir = path.resolve(__dirname, "bg-remove-work", slug);
    const origDir = path.join(workDir, "originals");
    const tpDir = path.join(workDir, "transparent");
    const webpDir = path.join(workDir, "webp");
    fs.mkdirSync(origDir, { recursive: true });
    fs.mkdirSync(tpDir, { recursive: true });
    fs.mkdirSync(webpDir, { recursive: true });

    for (const row of group) {
      const stem = fileNameFromUrl(row.url, row.position);
      const origPath = path.join(origDir, `${stem}.jpg`);
      const tpPath = path.join(tpDir, `${stem}.png`);
      const webpPath = path.join(webpDir, `${stem}.webp`);
      const remotePath = `merch/${slug}/${stem}.webp`;
      const newUrl = `${PULL_ZONE}/${remotePath}`;

      try {
        if (!fs.existsSync(origPath)) {
          const bytes = await download(row.url, origPath);
          console.log(`  pos ${row.position} (${row.printify_position ?? "-"})  dl ${bytes}b`);
        } else {
          console.log(`  pos ${row.position} (${row.printify_position ?? "-"})  cached`);
        }
        if (!fs.existsSync(tpPath)) rembg(origPath, tpPath);
        if (!fs.existsSync(webpPath)) await pngToWebp(tpPath, webpPath);

        if (APPLY) {
          await uploadToBunny(webpPath, remotePath);
          const { error: updErr } = await db()
            .from("product_images")
            .update({ url: newUrl, updated_at: new Date().toISOString() })
            .eq("id", row.id);
          if (updErr) throw updErr;
          console.log(`    -> ${newUrl}`);
        } else {
          console.log(`    [dry] would write ${newUrl}`);
        }
        okImages++;
      } catch (e) {
        failImages++;
        console.error(`    !! ${(e as Error).message}`);
      }
    }

    if (APPLY) {
      await syncMerchColumns(productId);
      console.log(`  merch columns synced from gallery`);
    }
  }

  console.log(`\nDone. ${okImages} images ok, ${failImages} failed.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
