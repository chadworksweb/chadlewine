import { createAdminClient } from "@/lib/supabase-server";
import { resolvePageId } from "@/lib/pages";

// POST /api/admin/pages/[id]/sections -- add a section to the page.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: idOrSlug } = await params;
  const db = createAdminClient();
  const pageId = await resolvePageId(idOrSlug);
  if (!pageId) return Response.json({ error: "Page not found" }, { status: 404 });

  const body = await request.json();
  const type = typeof body.type === "string" ? body.type.trim() : "";
  if (!type) return Response.json({ error: "type is required" }, { status: 400 });

  // Default position to the end of the page.
  let position = typeof body.position === "number" ? body.position : null;
  if (position === null) {
    const { data: last } = await db
      .from("page_sections")
      .select("position")
      .eq("page_id", pageId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    position = (last?.position ?? -10) + 10;
  }

  const status = body.status === "open" || body.status === "filled" ? body.status : null;

  const { data, error } = await db
    .from("page_sections")
    .insert({
      page_id: pageId,
      type,
      position,
      heading: body.heading ?? null,
      body: body.body ?? null,
      data: body.data ?? {},
      status,
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data, { status: 201 });
}

// PUT /api/admin/pages/[id]/sections -- reorder: body { order: [{id, position}] }.
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: idOrSlug } = await params;
  const db = createAdminClient();
  const pageId = await resolvePageId(idOrSlug);
  if (!pageId) return Response.json({ error: "Page not found" }, { status: 404 });

  const body = await request.json();
  const order = Array.isArray(body.order) ? body.order : [];
  if (order.length === 0) return Response.json({ error: "order array is required" }, { status: 400 });

  for (const item of order) {
    if (!item?.id || typeof item.position !== "number") continue;
    // Scope every update to this page so a stray id can't move another page's row.
    const { error } = await db
      .from("page_sections")
      .update({ position: item.position })
      .eq("id", item.id)
      .eq("page_id", pageId);
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}
