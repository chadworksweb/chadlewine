/**
 * migrate-md-to-supabase.ts
 * One-time migration: reads 54 observation .md files from the Astro backup
 * and inserts them into the Supabase observations table + observation_domains junction.
 *
 * Usage: npx tsx scripts/migrate-md-to-supabase.ts
 *
 * Requires: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import matter from "gray-matter";

const ASTRO_OBSERVATIONS_DIR = path.resolve(
  "C:/Users/chad/Local Sites/chadlewine-astro/src/content/observations"
);

const ASTRO_FOUNDATIONS_DIR = path.resolve(
  "C:/Users/chad/Local Sites/chadlewine-astro/src/content/foundations"
);

// Load env
const envPath = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  envContent.split("\n").forEach((line) => {
    const [key, ...valueParts] = line.split("=");
    if (key && valueParts.length > 0) {
      process.env[key.trim()] = valueParts.join("=").trim();
    }
  });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function migrateObservations() {
  const files = fs.readdirSync(ASTRO_OBSERVATIONS_DIR).filter((f) => f.endsWith(".md"));
  console.log(`Found ${files.length} observation files`);

  let success = 0;
  let failed = 0;

  for (const file of files) {
    const filePath = path.join(ASTRO_OBSERVATIONS_DIR, file);
    const raw = fs.readFileSync(filePath, "utf-8");
    const { data: fm, content } = matter(raw);

    const observation = {
      title: fm.title || file.replace(".md", ""),
      slug: fm.slug || file.replace(".md", ""),
      body: content,
      date_captured: fm.dateCaptured
        ? new Date(fm.dateCaptured).toISOString().split("T")[0]
        : "2020-01-01",
      art_image_path: fm.artImage || "/placeholder-art.webp",
      art_alt: fm.artAlt || fm.title || "",
      hook_line: fm.hookLine || "",
      tension_line: fm.tensionLine || "",
      status: fm.status || "published",
      seo_title: fm.seoTitle || null,
      seo_description: fm.seoDescription || null,
      merch_lines: fm.merchLines || [],
      merch_enabled: fm.merchEnabled || false,
      source: fm.source || "original",
      published_at: fm.status === "published" ? new Date().toISOString() : null,
    };

    const { data: inserted, error } = await supabase
      .from("observations")
      .insert(observation)
      .select("id")
      .single();

    if (error) {
      console.error(`FAILED: ${file} — ${error.message}`);
      failed++;
      continue;
    }

    // Insert domain junctions
    const domains: string[] = fm.domains || ["general"];
    if (domains.length > 0 && inserted) {
      const domainRows = domains.map((d: string) => ({
        observation_id: inserted.id,
        domain_slug: d,
      }));

      const { error: domainError } = await supabase
        .from("observation_domains")
        .insert(domainRows);

      if (domainError) {
        console.warn(`  Warning: domains for ${file} — ${domainError.message}`);
      }
    }

    console.log(`OK: ${fm.title} (${domains.join(", ")})`);
    success++;
  }

  console.log(`\nObservations: ${success} success, ${failed} failed, ${files.length} total`);
}

async function migrateFoundations() {
  if (!fs.existsSync(ASTRO_FOUNDATIONS_DIR)) {
    console.log("No foundations directory found, skipping");
    return;
  }

  const files = fs.readdirSync(ASTRO_FOUNDATIONS_DIR).filter((f) => f.endsWith(".md"));
  console.log(`Found ${files.length} foundation files`);

  for (const file of files) {
    const filePath = path.join(ASTRO_FOUNDATIONS_DIR, file);
    const raw = fs.readFileSync(filePath, "utf-8");
    const { data: fm, content } = matter(raw);

    const foundation = {
      title: fm.title || file.replace(".md", ""),
      slug: fm.slug || file.replace(".md", ""),
      body: content || "Founding text — content coming soon.",
      display_order: fm.order || 1,
    };

    const { error } = await supabase.from("foundations").insert(foundation);

    if (error) {
      console.error(`FAILED: ${file} — ${error.message}`);
    } else {
      console.log(`OK: ${fm.title}`);
    }
  }
}

async function main() {
  console.log("=== Migrating Observations ===");
  await migrateObservations();
  console.log("\n=== Migrating Foundations ===");
  await migrateFoundations();
  console.log("\nDone.");
}

main().catch(console.error);
