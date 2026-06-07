import { createAdminClient, createPublicClient } from "@/lib/supabase-server";

// Pages CMS: DB-driven standalone pages composed from typed sections.
// Schema: supabase/migrations/20260606130000_pages_cms.sql
// Section data contract: scripts/seed-pages-cms.ts

export type PageStatus = "draft" | "published";
export type PromptStatus = "open" | "filled";

export interface PageRow {
  id: string;
  slug: string;
  parent_id: string | null;
  title: string;
  template: string;
  status: PageStatus;
  seo_title: string | null;
  seo_description: string | null;
  og_image_path: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface PageSectionRow {
  id: string;
  page_id: string;
  type: string;
  position: number;
  heading: string | null;
  body: string | null;
  data: Record<string, unknown>;
  status: PromptStatus | null;
  created_at: string;
  updated_at: string;
}

export interface PageListItem extends PageRow {
  parent_title: string | null;
  section_count: number;
  open_prompt_count: number;
}

// Columns the admin save endpoints are allowed to write. seo_title /
// seo_description are canonical and present here on purpose (reuse the shipped
// basic-SEO pattern; no second SEO surface).
export const PAGE_WRITABLE_FIELDS = [
  "slug",
  "parent_id",
  "title",
  "template",
  "status",
  "seo_title",
  "seo_description",
  "og_image_path",
  "sort_order",
] as const;

export const SECTION_WRITABLE_FIELDS = [
  "type",
  "position",
  "heading",
  "body",
  "data",
  "status",
] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

// Page slugs are FULL PATHS (e.g. music/songs-over-5-minutes), so -- unlike
// slugify() -- slashes are preserved. Lowercase, path-safe chars only, no
// leading/trailing/double slashes.
export function normalizePageSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^\w\s/-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/\/+/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .replace(/^-+|-+$/g, "");
}

// ---------------------------------------------------------------------------
// Admin reads (service role)
// ---------------------------------------------------------------------------

export async function listPagesForAdmin(): Promise<PageListItem[]> {
  const db = createAdminClient();

  const { data: pages, error } = await db
    .from("pages")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("slug", { ascending: true });
  if (error) throw new Error(error.message);

  const rows = (pages || []) as PageRow[];
  const titleById = new Map(rows.map((p) => [p.id, p.title]));

  // open-prompt counts via the page_prompts view
  const { data: openPrompts } = await db
    .from("page_prompts")
    .select("page_id")
    .eq("status", "open");
  const openByPage = new Map<string, number>();
  for (const r of (openPrompts || []) as Array<{ page_id: string }>) {
    openByPage.set(r.page_id, (openByPage.get(r.page_id) || 0) + 1);
  }

  // section counts
  const { data: secs } = await db.from("page_sections").select("page_id");
  const secByPage = new Map<string, number>();
  for (const r of (secs || []) as Array<{ page_id: string }>) {
    secByPage.set(r.page_id, (secByPage.get(r.page_id) || 0) + 1);
  }

  return rows.map((p) => ({
    ...p,
    parent_title: p.parent_id ? titleById.get(p.parent_id) ?? null : null,
    section_count: secByPage.get(p.id) || 0,
    open_prompt_count: openByPage.get(p.id) || 0,
  }));
}

export async function resolvePageId(idOrSlug: string): Promise<string | null> {
  if (isUuid(idOrSlug)) return idOrSlug;
  const db = createAdminClient();
  const { data } = await db.from("pages").select("id").eq("slug", idOrSlug).maybeSingle();
  return data?.id ?? null;
}

export async function getPageWithSections(
  idOrSlug: string,
): Promise<{ page: PageRow; sections: PageSectionRow[] } | null> {
  const db = createAdminClient();
  const field = isUuid(idOrSlug) ? "id" : "slug";
  const { data: page } = await db.from("pages").select("*").eq(field, idOrSlug).maybeSingle();
  if (!page) return null;

  const { data: sections } = await db
    .from("page_sections")
    .select("*")
    .eq("page_id", page.id)
    .order("position", { ascending: true });

  return { page: page as PageRow, sections: (sections || []) as PageSectionRow[] };
}

// ---------------------------------------------------------------------------
// Public read (anon, RLS-gated) -- used by the Phase 5 renderer
// ---------------------------------------------------------------------------

export async function getPublishedPageWithSections(
  slug: string,
): Promise<{ page: PageRow; sections: PageSectionRow[] } | null> {
  const db = createPublicClient();
  const { data: page } = await db
    .from("pages")
    .select("*")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (!page) return null;

  const { data: sections } = await db
    .from("page_sections")
    .select("*")
    .eq("page_id", page.id)
    .order("position", { ascending: true });

  return { page: page as PageRow, sections: (sections || []) as PageSectionRow[] };
}
