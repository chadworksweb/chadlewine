import { createAdminClient } from "@/lib/supabase-server";
import { listPagesForAdmin, normalizePageSlug } from "@/lib/pages";

// GET /api/admin/pages -- list with parent title, section + open-prompt counts.
export async function GET() {
  try {
    const pages = await listPagesForAdmin();
    return Response.json(pages);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

// POST /api/admin/pages -- create a page (record only; sections added after).
export async function POST(request: Request) {
  const db = createAdminClient();
  const body = await request.json();

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return Response.json({ error: "title is required" }, { status: 400 });

  const slug = normalizePageSlug(body.slug || title);
  if (!slug) return Response.json({ error: "slug is required" }, { status: 400 });

  const { data, error } = await db
    .from("pages")
    .insert({
      slug,
      title,
      parent_id: body.parent_id || null,
      template: body.template || "standard",
      status: body.status === "published" ? "published" : "draft",
      seo_title: body.seo_title || null,
      seo_description: body.seo_description || null,
      og_image_path: body.og_image_path || null,
      sort_order: typeof body.sort_order === "number" ? body.sort_order : 0,
    })
    .select()
    .single();

  if (error) {
    const status = error.code === "23505" ? 409 : 500; // unique_violation
    return Response.json({ error: error.message }, { status });
  }
  return Response.json(data, { status: 201 });
}
