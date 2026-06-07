import { createAdminClient } from "@/lib/supabase-server";
import { resolvePageId, SECTION_WRITABLE_FIELDS } from "@/lib/pages";

// PUT /api/admin/pages/[id]/sections/[sectionId]
// Update a section: heading/body/data/position/type, and the prompt status
// toggle (status open|filled) all go through here.
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; sectionId: string }> },
) {
  const { id: idOrSlug, sectionId } = await params;
  const db = createAdminClient();
  const pageId = await resolvePageId(idOrSlug);
  if (!pageId) return Response.json({ error: "Page not found" }, { status: 404 });

  const body = await request.json();
  const updates: Record<string, unknown> = {};
  for (const f of SECTION_WRITABLE_FIELDS) {
    if (f in body) updates[f] = body[f];
  }
  if ("status" in updates && !(updates.status === "open" || updates.status === "filled" || updates.status === null)) {
    return Response.json({ error: "status must be open, filled, or null" }, { status: 400 });
  }

  const { data, error } = await db
    .from("page_sections")
    .update(updates)
    .eq("id", sectionId)
    .eq("page_id", pageId)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "Section not found" }, { status: 404 });
  return Response.json(data);
}

// DELETE /api/admin/pages/[id]/sections/[sectionId]
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; sectionId: string }> },
) {
  const { id: idOrSlug, sectionId } = await params;
  const db = createAdminClient();
  const pageId = await resolvePageId(idOrSlug);
  if (!pageId) return Response.json({ error: "Page not found" }, { status: 404 });

  const { error } = await db
    .from("page_sections")
    .delete()
    .eq("id", sectionId)
    .eq("page_id", pageId);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
