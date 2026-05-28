/**
 * bg-remove-rerun.ts
 *
 * Reprocess the gallery for one or more merch slugs using a stronger rembg
 * model (default: isnet-general-use). The original printify mockups are
 * pulled from scripts/bg-remove-work/<slug>/originals/ -- if missing, we
 * re-fetch them from the Bunny URLs (which are derived from the printify
 * filename pattern <position>__<stem>__<camera>). Outputs land at the same
 * filename + a "-v<N>" suffix so the new asset is a fresh URL (no Bunny
 * cache invalidation needed), and product_images.url is repointed.
 *
 * Usage:
 *   npx tsx scripts/bg-remove-rerun.ts <slug> [<slug>...]            # dry
 *   npx tsx scripts/bg-remove-rerun.ts <slug> [<slug>...] --apply    # upload + DB
 *   npx tsx scripts/bg-remove-rerun.ts <slug> --model birefnet-general --apply
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

function deriveStem(currentUrl: string): { stem: string; ext: string } | null {
  // Bunny URLs look like .../merch/<slug>/<position>__<stem>__<camera>.webp
  // or .../<position>__<stem>__<camera>-v2.webp for prior reruns.
  const m = currentUrl.match(/\/([^/]+?)(\-v\d+)?\.(webp|png|jpg|jpeg)$/i);
  if (!m) return null;
  return { stem: m[1], ext: m[3].toLowerCase() };
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

function rembg(inFile: string, outFile: string, model: string) {
  execFileSync("rembg", ["i", "-m", model, inFile, outFile], { stdio: "inherit" });
}

async function pngToWebp(pngPath: string, webpPath: string) {
  await sharp(pngPath)
    .webp({ quality: 92, alphaQuality: 100, effort: 5 })
    .toFile(webpPath);
}

async function syncMerchColumns(productId: string) {
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

async function processSlug(slug: string, apply: boolean, model: string, versionTag: string) {
  console.log(`\n=== ${slug} (model=${model}, tag=${versionTag}) ===`);

  const workDir = path.resolve(__dirname, "bg-remove-work", slug);
  const origDir = path.join(workDir, "originals");
  const tpDir = path.join(workDir, `transparent-${versionTag}`);
  const webpDir = path.join(workDir, `webp-${versionTag}`);
  fs.mkdirSync(tpDir, { recursive: true });
  fs.mkdirSync(webpDir, { recursive: true });

  const { data: product, error } = await db()
    .from("merch")
    .select("id, slug, title")
    .eq("slug", slug)
    .single();
  if (error || !product) {
    console.error(`  product not found: ${error?.message ?? "n/a"}`);
    return { ok: 0, fail: 0 };
  }

  const { data: imgs } = await db()
    .from("product_images")
    .select("id, position, url, is_primary, is_hidden")
    .eq("product_id", product.id)
    .is("deleted_at", null)
    .order("position");
  const rows = (imgs || []) as { id: string; position: number; url: string; is_primary: boolean; is_hidden: boolean }[];
  console.log(`  ${rows.length} product_images rows`);

  let ok = 0;
  let fail = 0;
  for (const row of rows) {
    const stemInfo = deriveStem(row.url);
    if (!stemInfo) {
      console.warn(`  skip pos ${row.position}: can't derive stem from ${row.url}`);
      continue;
    }
    const stem = stemInfo.stem.replace(/-v\d+$/, ""); // drop any prior version tag
    // Cached original lives next to the stem with .jpg ext.
    const origJpg = path.join(origDir, `${stem}.jpg`);
    if (!fs.existsSync(origJpg)) {
      console.warn(`  skip pos ${row.position}: no cached original at ${origJpg}`);
      fail++;
      continue;
    }
    const tpPath = path.join(tpDir, `${stem}.png`);
    const webpName = `${stem}-${versionTag}.webp`;
    const webpPath = path.join(webpDir, webpName);
    const remotePath = `merch/${slug}/${webpName}`;
    const newUrl = `${PULL_ZONE}/${remotePath}`;

    try {
      if (!fs.existsSync(tpPath)) rembg(origJpg, tpPath, model);
      if (!fs.existsSync(webpPath)) await pngToWebp(tpPath, webpPath);
      if (apply) {
        await uploadToBunny(webpPath, remotePath);
        const { error: updErr } = await db()
          .from("product_images")
          .update({ url: newUrl, updated_at: new Date().toISOString() })
          .eq("id", row.id);
        if (updErr) throw updErr;
        console.log(`  pos ${row.position}  -> ${newUrl}`);
      } else {
        console.log(`  pos ${row.position}  [dry] would write ${newUrl}`);
      }
      ok++;
    } catch (e) {
      fail++;
      console.error(`  pos ${row.position} !! ${(e as Error).message}`);
    }
  }

  if (apply && ok > 0) {
    await syncMerchColumns(product.id);
    console.log(`  merch columns synced`);
  }
  return { ok, fail };
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const modelIdx = args.indexOf("--model");
  const model = modelIdx >= 0 ? args[modelIdx + 1] : "isnet-general-use";
  const slugs = args.filter((a) => !a.startsWith("--") && a !== model);

  if (slugs.length === 0) {
    console.error("Usage: npx tsx scripts/bg-remove-rerun.ts <slug> [<slug>...] [--model <name>] [--apply]");
    process.exit(1);
  }

  // Pick a short version tag from the model + a short timestamp so reruns
  // don't collide.
  const tag = `${model.replace(/[^a-z0-9]/gi, "")}-${Date.now().toString(36).slice(-4)}`;
  console.log(`[${apply ? "APPLY" : "DRY"}] reprocessing ${slugs.length} slug(s) with rembg model=${model}, tag=${tag}`);

  let okTotal = 0;
  let failTotal = 0;
  for (const slug of slugs) {
    const r = await processSlug(slug, apply, model, tag);
    okTotal += r.ok;
    failTotal += r.fail;
  }
  console.log(`\nDone. ${okTotal} ok, ${failTotal} failed.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
