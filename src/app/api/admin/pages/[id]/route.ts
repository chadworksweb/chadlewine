import { createAdminClient } from "@/lib/supabase-server";
import { captureSlugChange } from "@/lib/redirects";
import {
  getPageWithSections,
  resolvePageId,
  normalizePageSlug,
  PAGE_WRITABLE_FIELDS,
} from "@/lib/pages";

// GET /api/admin/pages/[id] -- page record + its ordered sections.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await getPageWithSections(id);
  if (!result) return Response.json({ error: "Page not found" }, { status: 404 });
  return Response.json(result);
}

// PUT /api/admin/pages/[id] -- update slug/title/parent/status/SEO/etc.
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: idOrSlug } = await params;
  const db = createAdminClient();
  const id = await resolvePageId(idOrSlug);
  if (!id) return Response.json({ error: "Page not found" }, { status: 404 });

  const body = await request.json();
  const updates: Record<string, unknown> = {};
  for (const f of PAGE_WRITABLE_FIELDS) {
    if (f in body) updates[f] = body[f];
  }

  if (typeof updates.slug === "string") {
    const normalized = normalizePageSlug(updates.slug);
    if (!normalized) return Response.json({ error: "slug cannot be empty" }, { status: 400 });
    updates.slug = normalized;
  }

  // A page cannot be its own parent.
  if ("parent_id" in updates && updates.parent_id === id) {
    return Response.json({ error: "A page cannot be its own parent" }, { status: 400 });
  }
  if (updates.parent_id === "") updates.parent_id = null;

  const { data: prev } = await db.from("pages").select("slug").eq("id", id).single();

  const { data, error } = await db
    .from("pages")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    const status = error.code === "23505" ? 409 : 500;
    return Response.json({ error: error.message }, { status });
  }

  // Preserve link equity on slug change (301 old path -> new path).
  if (typeof updates.slug === "string" && prev?.slug && prev.slug !== updates.slug) {
    await captureSlugChange(`/${prev.slug}`, `/${updates.slug}`, "page", id);
  }

  // Managed pages still render from code and read SEO from page_meta. This is
  // now the only admin SEO surface for them, so mirror seo_* into page_meta so
  // edits actually take effect on the live (code-rendered) page. Standard
  // (DB-rendered) pages read SEO straight from pages.seo_* -- no mirror needed.
  if (
    data?.template === "managed" &&
    ("seo_title" in updates || "seo_description" in updates || "og_image_path" in updates)
  ) {
    const route = data.slug === "home" ? "/" : `/${data.slug}`;
    await db.from("page_meta").upsert(
      {
        route,
        title: data.seo_title || null,
        description: data.seo_description || null,
        og_image_path: data.og_image_path || null,
      },
      { onConflict: "route" },
    );
  }

  return Response.json(data);
}

// DELETE /api/admin/pages/[id] -- removes the page; sections cascade.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: idOrSlug } = await params;
  const db = createAdminClient();
  const id = await resolvePageId(idOrSlug);
  if (!id) return Response.json({ error: "Page not found" }, { status: 404 });

  const { error } = await db.from("pages").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
