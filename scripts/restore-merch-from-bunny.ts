/**
 * restore-merch-from-bunny.ts
 *
 * Repoint products.image_url + image_urls at the BG-removed PNGs already
 * sitting in Bunny `merch/<slug>/`. Use after the Printify webhook overwrote
 * the DB with Printify CDN URLs but the Bunny files are still intact.
 *
 * Usage:
 *   npx tsx scripts/restore-merch-from-bunny.ts            # dry
 *   npx tsx scripts/restore-merch-from-bunny.ts --apply    # write DB
 *   npx tsx scripts/restore-merch-from-bunny.ts --slug <slug> [--apply]
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

const envPath = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf-8").split("\n").forEach((line) => {
    const [k, ...rest] = line.split("=");
    if (k && rest.length > 0 && !(k.trim() in process.env)) process.env[k.trim()] = rest.join("=").trim();
  });
}

const STORAGE_HOSTNAME = process.env.BUNNY_STORAGE_HOSTNAME ?? "ny.storage.bunnycdn.com";
const STORAGE_ZONE = process.env.BUNNY_STORAGE_ZONE_SITE_IMAGES!;
const STORAGE_PW = process.env.BUNNY_STORAGE_ZONE_SITE_IMAGES_PASSWORD!;
const PULL_ZONE = (process.env.NEXT_PUBLIC_BUNNY_PULL_ZONE_SITE_IMAGES || "").replace(/\/$/, "");

const APPLY = process.argv.includes("--apply");
const slugIdx = process.argv.indexOf("--slug");
const onlySlug = slugIdx !== -1 ? process.argv[slugIdx + 1] : null;

interface BunnyEntry { ObjectName: string; IsDirectory: boolean; Length: number; }

async function listBunny(prefix: string): Promise<BunnyEntry[]> {
  const url = `https://${STORAGE_HOSTNAME}/${STORAGE_ZONE}/${prefix}/`;
  const res = await fetch(url, { headers: { AccessKey: STORAGE_PW, Accept: "application/json" } });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`LIST ${url} -> ${res.status} ${await res.text()}`);
  return (await res.json()) as BunnyEntry[];
}

(async () => {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  let q = supabase.from("products").select("id, slug, title, image_url, image_urls").not("slug", "is", null);
  if (onlySlug) q = q.eq("slug", onlySlug);
  const { data, error } = await q;
  if (error) throw error;
  if (!data || data.length === 0) { console.log("no products"); return; }

  for (const p of data) {
    const entries = await listBunny(`merch/${p.slug}`);
    const files = entries.filter((e) => !e.IsDirectory && e.ObjectName.toLowerCase().endsWith(".png"));
    files.sort((a, b) => a.ObjectName.localeCompare(b.ObjectName));
    const bunnyUrls = files.map((f) => `${PULL_ZONE}/merch/${p.slug}/${f.ObjectName}`);

    const all = [p.image_url, ...(p.image_urls || [])].filter(Boolean) as string[];
    const isWiped = all.length > 0 && all.every((u) => u.includes("images-api.printify.com"));

    console.log(`\n${p.slug}`);
    console.log(`  bunny: ${files.length} files | db: ${all.length} urls | wiped=${isWiped}`);
    if (files.length === 0) { console.log("  (no Bunny files — skip)"); continue; }
    if (!isWiped && !onlySlug) { console.log("  (db not wiped — skip; pass --slug to force)"); continue; }

    if (!APPLY) {
      console.log(`  WOULD SET image_url=${bunnyUrls[0]}`);
      console.log(`  WOULD SET image_urls=[${bunnyUrls.length} entries]`);
      for (const u of bunnyUrls) console.log(`    ${u}`);
      continue;
    }

    const { error: updErr } = await supabase
      .from("products")
      .update({ image_url: bunnyUrls[0], image_urls: bunnyUrls })
      .eq("id", p.id);
    if (updErr) throw updErr;
    console.log(`  DB updated (${bunnyUrls.length} URLs)`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
