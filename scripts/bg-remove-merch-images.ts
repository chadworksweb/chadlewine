/**
 * bg-remove-merch-images.ts
 *
 * Pull a product's mockup images from Printify, run them through rembg to
 * produce transparent-background PNGs (same pixel dimensions), upload the
 * results to the Bunny site-images zone, and rewrite the DB row to point at
 * the new Bunny URLs.
 *
 * Originals land in scripts/bg-remove-work/<slug>/originals/, BG-removed PNGs
 * in .../transparent/.
 *
 * Usage:
 *   npx tsx scripts/bg-remove-merch-images.ts <slug>            # dry run
 *   npx tsx scripts/bg-remove-merch-images.ts <slug> --apply    # upload + DB write
 *
 * Also exports processProduct(slug, apply) for batch driver scripts.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

function loadEnv() {
  const envPath = path.resolve(__dirname, "../.env.local");
  if (!fs.existsSync(envPath)) return;
  fs.readFileSync(envPath, "utf-8")
    .split("\n")
    .forEach((line) => {
      const [k, ...rest] = line.split("=");
      if (k && rest.length > 0) process.env[k.trim()] = rest.join("=").trim();
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

function fileNameFromUrl(url: string, fallbackIndex: number): string {
  const u = new URL(url);
  const base = path.basename(u.pathname);
  const cam = u.searchParams.get("camera_label");
  const stem = base.replace(/\.[^.]+$/, "");
  const ext = path.extname(base) || ".jpg";
  const camPart = cam ? `__${cam.replace(/[^a-z0-9-]+/gi, "-")}` : "";
  return `${String(fallbackIndex).padStart(2, "0")}__${stem}${camPart}${ext}`;
}

async function download(url: string, dest: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  return buf.length;
}

function rembg(inFile: string, outFile: string) {
  execFileSync("rembg", ["i", inFile, outFile], { stdio: "inherit" });
}

async function uploadToBunny(localPath: string, remotePath: string): Promise<string> {
  if (!STORAGE_ZONE || !STORAGE_PW || !PULL_ZONE) throw new Error("Missing Bunny site-images env");
  const buf = fs.readFileSync(localPath);
  const url = `https://${STORAGE_HOSTNAME}/${STORAGE_ZONE}/${remotePath}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { AccessKey: STORAGE_PW, "Content-Type": "image/png" },
    body: buf,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`PUT ${url} -> ${res.status} ${txt}`);
  }
  return `${PULL_ZONE}/${remotePath}`;
}

export async function processProduct(slug: string, apply: boolean): Promise<void> {
  console.log(`[${apply ? "APPLY" : "DRY"}] ${slug}`);

  const workDir = path.resolve(__dirname, "bg-remove-work", slug);
  const origDir = path.join(workDir, "originals");
  const tpDir = path.join(workDir, "transparent");
  fs.mkdirSync(origDir, { recursive: true });
  fs.mkdirSync(tpDir, { recursive: true });

  const { data: product, error } = await db()
    .from("products")
    .select("id, slug, title, image_url, image_urls")
    .eq("slug", slug)
    .single();
  if (error) throw error;
  if (!product) throw new Error(`No product with slug=${slug}`);
  console.log(`  ${product.title} (id=${product.id})`);

  const allUrls: string[] = [];
  const seen = new Set<string>();
  if (product.image_url) {
    allUrls.push(product.image_url);
    seen.add(product.image_url);
  }
  for (const u of product.image_urls || []) {
    if (u && !seen.has(u)) {
      allUrls.push(u);
      seen.add(u);
    }
  }
  console.log(`  ${allUrls.length} image URLs`);

  type Mapping = { srcUrl: string; tpPath: string; tpName: string; bunnyUrl: string };
  const mapping: Mapping[] = [];

  for (let i = 0; i < allUrls.length; i++) {
    const src = allUrls[i];
    const fname = fileNameFromUrl(src, i);
    const origPath = path.join(origDir, fname);
    const tpName = fname.replace(/\.[^.]+$/, ".png");
    const tpPath = path.join(tpDir, tpName);

    if (!fs.existsSync(origPath)) {
      const bytes = await download(src, origPath);
      console.log(`    [${i + 1}/${allUrls.length}] downloaded ${bytes}b`);
    } else {
      console.log(`    [${i + 1}/${allUrls.length}] cached`);
    }
    if (!fs.existsSync(tpPath)) {
      rembg(origPath, tpPath);
    }

    const remotePath = `merch/${product.slug}/${tpName}`;
    mapping.push({ srcUrl: src, tpPath, tpName, bunnyUrl: `${PULL_ZONE}/${remotePath}` });
  }

  if (!apply) {
    for (const m of mapping) console.log(`    -> ${m.bunnyUrl}`);
    return;
  }

  for (const m of mapping) {
    const remotePath = `merch/${product.slug}/${m.tpName}`;
    m.bunnyUrl = await uploadToBunny(m.tpPath, remotePath);
    console.log(`    uploaded ${remotePath}`);
  }

  const newImageUrl = mapping[0]?.bunnyUrl ?? null;
  const newImageUrls = mapping.map((m) => m.bunnyUrl);

  const { error: updErr } = await db()
    .from("products")
    .update({ image_url: newImageUrl, image_urls: newImageUrls })
    .eq("id", product.id);
  if (updErr) throw updErr;
  console.log(`  DB updated (${newImageUrls.length} URLs)`);
}

const isDirectRun = require.main === module;
if (isDirectRun) {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const slug = args.find((a) => !a.startsWith("--"));
  if (!slug) {
    console.error("Usage: npx tsx scripts/bg-remove-merch-images.ts <slug> [--apply]");
    process.exit(1);
  }
  processProduct(slug, apply).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
