/**
 * Chad Rising → chadlewine.com Data Migration
 *
 * Reads cr-products.jsonl and cr-videos.jsonl from scripts/migration-data/
 * Inserts into Supabase: albums, tracks, video_categories, videos, art_pieces
 *
 * Run: node scripts/migrate-chadrising.mjs
 * Requires: SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL in .env.local
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { config } from "dotenv";

config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// CDN base URLs
const STREAMING_CDN = "https://chadrising-streaming-audio.b-cdn.net";
const VIDEO_CDN_HOST = "vz-5624b738-7bf.b-cdn.net";

// ── Helpers ──

function parseJsonl(path) {
  return readFileSync(path, "utf-8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

function priceToCents(priceStr) {
  if (!priceStr) return null;
  const n = parseFloat(priceStr);
  return isNaN(n) ? null : Math.round(n * 100);
}

function cleanDownloadPath(p) {
  if (!p || !p.trim()) return null;
  return p.trim();
}

function cleanStreamingPath(p) {
  if (!p || !p.trim()) return null;
  return p.trim();
}

// ── Load data ──

const products = parseJsonl("scripts/migration-data/cr-products.jsonl");
const videoRows = parseJsonl("scripts/migration-data/cr-videos.jsonl");

// ── Classify products ──

const albumProducts = [];
const trackProducts = [];
const artProducts = [];

for (const p of products) {
  const m = p.meta || {};
  const hasFormat = m._aw_product_format || m._awcr_album_format;
  const hasParent = (m._awcr_parent_album || "").trim();
  const hasStreaming = (m._awcr_streaming_path || "").trim();
  const hasDuration = (m._awcr_duration || "").trim();
  const cat = (p.category || "").toLowerCase();

  if (hasFormat) {
    albumProducts.push(p);
  } else if (cat.includes("art") && !hasStreaming && !hasParent) {
    artProducts.push(p);
  } else if (hasParent || hasStreaming || (hasDuration && hasDuration !== "0")) {
    trackProducts.push(p);
  }
  // skip anything else (Literature, etc.)
}

console.log(`Albums: ${albumProducts.length}`);
console.log(`Tracks: ${trackProducts.length}`);
console.log(`Art: ${artProducts.length}`);
console.log(`Videos: ${videoRows.length}`);

// ── Map WP album IDs → Supabase UUIDs ──

const wpAlbumIdToUuid = new Map();

// ── 1. Insert Albums ──

async function migrateAlbums() {
  console.log("\n── Albums ──");

  // Sort by release date (oldest first, coming-soon last)
  albumProducts.sort((a, b) => {
    const aDate = a.meta?._awcr_release_date || "9999";
    const bDate = b.meta?._awcr_release_date || "9999";
    return aDate.localeCompare(bDate);
  });

  for (let i = 0; i < albumProducts.length; i++) {
    const p = albumProducts[i];
    const m = p.meta || {};

    const row = {
      title: p.title,
      slug: p.slug,
      release_date: m._awcr_release_date || null,
      cover_art_path: p.thumb_url || null,
      cover_art_alt: `${p.title} album art`,
      description: null,
      display_order: i,
      status: m._awcr_coming_soon === "yes" ? "draft" : "published",
    };

    // Fix local URL in cover art
    if (row.cover_art_path && row.cover_art_path.includes("chadrising.local")) {
      row.cover_art_path = row.cover_art_path.replace(
        "https://chadrising.local",
        "https://chadrising.com"
      );
    }

    // Empty release date → null
    if (row.release_date === "") row.release_date = null;

    const { data, error } = await supabase
      .from("albums")
      .upsert(row, { onConflict: "slug" })
      .select("id")
      .single();

    if (error) {
      console.error(`  FAIL: ${p.title}`, error.message);
      continue;
    }

    wpAlbumIdToUuid.set(String(p.wp_id), data.id);
    console.log(`  ✓ ${p.title} → ${data.id}`);
  }
}

// ── 2. Insert Tracks ──

async function migrateTracks() {
  console.log("\n── Tracks ──");

  let inserted = 0;
  let skipped = 0;

  for (const p of trackProducts) {
    const m = p.meta || {};
    const parentWpId = (m._awcr_parent_album || "").trim();
    const albumId = parentWpId ? wpAlbumIdToUuid.get(parentWpId) : null;
    const isSingle = !albumId;

    const trackNum = parseInt(m._awcr_track_number || "0", 10) || 0;

    const downloadPath =
      cleanDownloadPath(m._awcr_download_path_track) ||
      cleanDownloadPath(m._awcr_download_path) ||
      null;

    const row = {
      album_id: albumId || null,
      title: p.title,
      slug: p.slug,
      track_number: trackNum || 1,
      duration_seconds: parseInt(m._awcr_duration || "0", 10) || null,
      streaming_path: cleanStreamingPath(m._awcr_streaming_path),
      download_path: downloadPath,
      lyrics: (m._awcr_lyrics || "").trim() || null,
      price_cents: priceToCents(m._regular_price),
      is_single: isSingle,
      status: "published",
    };

    const { data, error } = await supabase
      .from("tracks")
      .upsert(row, { onConflict: "album_id,slug" })
      .select("id")
      .single();

    if (error) {
      console.error(`  FAIL: ${p.title} (wp:${p.wp_id})`, error.message);
      skipped++;
      continue;
    }

    inserted++;
  }

  console.log(`  Inserted: ${inserted}, Skipped: ${skipped}`);
}

// ── 3. Insert Video Categories ──

const videoCategoryMap = new Map();

async function migrateVideoCategories() {
  console.log("\n── Video Categories ──");

  // Collect unique categories from video data
  const cats = new Set();
  for (const v of videoRows) {
    if (v.category) {
      v.category.split(",").forEach((c) => cats.add(c.trim()));
    }
  }

  let i = 0;
  for (const catName of [...cats].sort()) {
    const slug = catName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const { data, error } = await supabase
      .from("video_categories")
      .upsert({ title: catName, slug, display_order: i }, { onConflict: "slug" })
      .select("id")
      .single();

    if (error) {
      console.error(`  FAIL: ${catName}`, error.message);
      continue;
    }

    videoCategoryMap.set(catName, data.id);
    console.log(`  ✓ ${catName} → ${data.id}`);
    i++;
  }
}

// ── 4. Insert Videos ──

async function migrateVideos() {
  console.log("\n── Videos ──");

  let inserted = 0;
  for (const v of videoRows) {
    const m = v.meta || {};

    // Pick first category if multiple
    const catName = v.category ? v.category.split(",")[0].trim() : null;
    const categoryId = catName ? videoCategoryMap.get(catName) : null;

    const isFeatured = m._awcr_is_featured === "1";
    const featuredOrder = parseInt(m._awcr_featured_order || "0", 10) || null;

    // Bunny Stream thumbnail URL
    const streamId = (m._awcr_bunny_video_id || "").trim();
    const thumbnailPath = streamId
      ? `https://${VIDEO_CDN_HOST}/${streamId}/thumbnail.jpg`
      : null;

    const row = {
      title: v.title,
      slug: v.slug,
      category_id: categoryId,
      stream_id: streamId || null,
      embed_url: (m._awcr_video_url || "").trim() || null,
      thumbnail_path: thumbnailPath,
      description: null,
      duration_seconds: parseInt(m._awcr_video_duration || "0", 10) || null,
      is_featured: isFeatured,
      status: "published",
      published_at: v.post_date || null,
    };

    const { data, error } = await supabase
      .from("videos")
      .upsert(row, { onConflict: "slug" })
      .select("id")
      .single();

    if (error) {
      console.error(`  FAIL: ${v.title}`, error.message);
      continue;
    }

    inserted++;
  }

  console.log(`  Inserted: ${inserted}`);
}

// ── 5. Insert Art Pieces ──

async function migrateArt() {
  console.log("\n── Art Pieces ──");

  // Bunny CDN base for art (from the _art_bunny_main paths)
  // These are relative paths like /paintings/35_web.webp
  // Need to determine the CDN base — checking the SFVV settings
  const ART_CDN = "https://chadrising-sfvv.b-cdn.net";

  let inserted = 0;
  for (let i = 0; i < artProducts.length; i++) {
    const p = artProducts[i];
    const m = p.meta || {};

    const bunnyPath = (m._art_bunny_main || "").trim();
    const imagePath = bunnyPath
      ? `${ART_CDN}${bunnyPath.startsWith("/") ? "" : "/"}${bunnyPath}`
      : p.thumb_url || null;

    const row = {
      title: p.title,
      slug: p.slug,
      medium: (m._art_medium || "").trim() || null,
      image_path: imagePath,
      image_alt: `${p.title} by Chad Lewine`,
      description: null,
      display_order: i,
      status: "published",
    };

    const { data, error } = await supabase
      .from("art_pieces")
      .upsert(row, { onConflict: "slug" })
      .select("id")
      .single();

    if (error) {
      console.error(`  FAIL: ${p.title}`, error.message);
      continue;
    }

    inserted++;
  }

  console.log(`  Inserted: ${inserted}`);
}

// ── Run ──

async function main() {
  console.log("Chad Rising → chadlewine.com migration\n");

  // Run the download_path migration first
  const { error: migError } = await supabase.rpc("exec_sql", {
    sql: "ALTER TABLE tracks ADD COLUMN IF NOT EXISTS download_path text",
  });
  // Ignore error — column might already exist or RPC might not be available
  // The migration file 019 handles this

  await migrateAlbums();
  await migrateTracks();
  await migrateVideoCategories();
  await migrateVideos();
  await migrateArt();

  console.log("\n── Done ──");
}

main().catch(console.error);
