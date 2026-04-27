/**
 * Upload Don't Blame Me cover (full-res + webp) and repoint DB.
 */
import { createReadStream, statSync } from "fs";
import { Readable } from "stream";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

const HOSTNAME = process.env.BUNNY_STORAGE_HOSTNAME ?? "ny.storage.bunnycdn.com";

async function put(zone: string, password: string, path: string, src: string, mime: string) {
  const url = `https://${HOSTNAME}/${zone}/${path}`;
  const size = statSync(src).size;
  const body = Readable.toWeb(createReadStream(src)) as unknown as ReadableStream;
  const res = await fetch(url, {
    method: "PUT",
    headers: { AccessKey: password, "Content-Type": mime, "Content-Length": String(size) },
    // @ts-expect-error duplex required for streamed body
    duplex: "half",
    body,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  console.log(`  up ${zone}/${path} (${(size / 1024).toFixed(0)} KB)`);
}

async function main() {
  // 1. Full-res JPG → cover-art zone
  await put(
    process.env.BUNNY_STORAGE_ZONE_COVER_ART!,
    process.env.BUNNY_STORAGE_ZONE_COVER_ART_PASSWORD!,
    "dont-blame-me.jpg",
    "D:/RECORDS/012 Don't Blame Me/Dont-Blame-Me_Chad-Lewine_album-cover-art.jpg",
    "image/jpeg"
  );

  // 2. Webp → site-images zone, cover-art-web subfolder
  await put(
    process.env.BUNNY_STORAGE_ZONE_SITE_IMAGES!,
    process.env.BUNNY_STORAGE_ZONE_SITE_IMAGES_PASSWORD!,
    "cover-art-web/dont-blame-me.webp",
    "D:/RECORDS/_repack_output/covers-web/dont-blame-me.webp",
    "image/webp"
  );

  // 3. Repoint DB
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const webUrl = `${process.env.NEXT_PUBLIC_BUNNY_PULL_ZONE_SITE_IMAGES!.replace(/\/+$/, "")}/cover-art-web/dont-blame-me.webp`;
  const { error } = await supabase.from("albums").update({ cover_art_path: webUrl }).eq("slug", "dont-blame-me");
  if (error) throw error;
  console.log(`  db albums[dont-blame-me].cover_art_path = ${webUrl}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
