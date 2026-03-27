import { createAdminClient } from "@/lib/supabase-server";

// GET /api/admin/meditations/[id]
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createAdminClient();

  const { data: meditation, error } = await supabase
    .from("meditations")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !meditation) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const { data: categoryLinks } = await supabase
    .from("meditation_categories")
    .select("category_id")
    .eq("meditation_id", id);

  const { data: thoughtlineLinks } = await supabase
    .from("meditation_thoughtlines")
    .select("thoughtline_id")
    .eq("meditation_id", id);

  const { data: tagLinks } = await supabase
    .from("meditation_tags")
    .select("tag_id")
    .eq("meditation_id", id);

  return Response.json({
    ...meditation,
    categories: categoryLinks?.map((c) => c.category_id) || [],
    thoughtlines: thoughtlineLinks?.map((t) => t.thoughtline_id) || [],
    tags: tagLinks?.map((t) => t.tag_id) || [],
  });
}

// PUT /api/admin/meditations/[id]
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createAdminClient();
  const body = await request.json();

  const {
    body: medBody,
    plain_text,
    status,
    categories,
    thoughtlines,
    tags,
  } = body;

  // Check if we need to set published_at
  const updateData: Record<string, unknown> = {
    body: medBody,
    plain_text,
    status,
  };

  if (status === "published") {
    // Only set published_at if it wasn't already published
    const { data: existing } = await supabase
      .from("meditations")
      .select("published_at")
      .eq("id", id)
      .single();

    if (!existing?.published_at) {
      updateData.published_at = new Date().toISOString();
    }
  }

  const { data: meditation, error } = await supabase
    .from("meditations")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  // Replace category mappings
  if (categories !== undefined) {
    await supabase
      .from("meditation_categories")
      .delete()
      .eq("meditation_id", id);

    if (categories.length > 0) {
      const rows = categories.map((cId: string) => ({
        meditation_id: id,
        category_id: cId,
      }));
      await supabase.from("meditation_categories").insert(rows);
    }
  }

  // Replace thoughtline mappings
  if (thoughtlines !== undefined) {
    await supabase
      .from("meditation_thoughtlines")
      .delete()
      .eq("meditation_id", id);

    if (thoughtlines.length > 0) {
      const rows = thoughtlines.map((tId: string) => ({
        meditation_id: id,
        thoughtline_id: tId,
      }));
      await supabase.from("meditation_thoughtlines").insert(rows);
    }
  }

  // Replace tag mappings
  if (tags !== undefined) {
    await supabase
      .from("meditation_tags")
      .delete()
      .eq("meditation_id", id);

    if (tags.length > 0) {
      const rows = tags.map((tId: string) => ({
        meditation_id: id,
        tag_id: tId,
      }));
      await supabase.from("meditation_tags").insert(rows);
    }
  }

  return Response.json(meditation);
}

// DELETE /api/admin/meditations/[id]
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("meditations")
    .delete()
    .eq("id", id);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}
