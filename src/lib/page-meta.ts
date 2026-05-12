import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase-server";

export interface PageMeta {
  title: string | null;
  description: string | null;
  og_image_path: string | null;
}

const EMPTY: PageMeta = { title: null, description: null, og_image_path: null };

export async function getPageMeta(route: string): Promise<PageMeta> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("page_meta")
    .select("title, description, og_image_path")
    .eq("route", route)
    .maybeSingle();
  return data ?? EMPTY;
}

function clean(v: string | null | undefined): string | null {
  const t = (v ?? "").toString().trim();
  return t ? t : null;
}

/**
 * Merge admin-editable page_meta overrides onto a page's hardcoded defaults.
 * Non-empty DB values win; blank/missing values fall back to defaults.
 */
export async function mergeMetadata(
  route: string,
  defaults: Metadata
): Promise<Metadata> {
  const db = await getPageMeta(route);
  const title = clean(db.title);
  const description = clean(db.description);
  const ogImage = clean(db.og_image_path);

  const merged: Metadata = { ...defaults };
  const existingOg = (defaults.openGraph as Record<string, unknown>) || {};
  const og: Record<string, unknown> = { ...existingOg };

  if (title) {
    // Absolute form tells Next.js to use this title verbatim and skip
    // the root layout's title template. Admin-set overrides are
    // authoritative — they shouldn't get " — Chad Lewine" appended.
    merged.title = { absolute: title };
    og.title = title;
  }
  if (description) {
    merged.description = description;
    og.description = description;
  }
  if (ogImage) {
    og.images = [{ url: ogImage }];
  }
  if (Object.keys(og).length > 0) {
    merged.openGraph = og as Metadata["openGraph"];
  }
  return merged;
}
