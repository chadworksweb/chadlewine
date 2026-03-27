import { createAdminClient } from "@/lib/supabase-server";

// GET /api/admin/meditations — list all meditations
export async function GET() {
  const supabase = createAdminClient();

  const { data: meditations, error } = await supabase
    .from("meditations")
    .select("id, body, plain_text, status, published_at, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  if (!meditations || meditations.length === 0) {
    return Response.json([]);
  }

  const ids = meditations.map((m) => m.id);

  const { data: categoryLinks } = await supabase
    .from("meditation_categories")
    .select("meditation_id, category_id")
    .in("meditation_id", ids);

  const categoryMap = new Map<string, string[]>();
  categoryLinks?.forEach((c) => {
    const existing = categoryMap.get(c.meditation_id) || [];
    existing.push(c.category_id);
    categoryMap.set(c.meditation_id, existing);
  });

  const { data: thoughtlineLinks } = await supabase
    .from("meditation_thoughtlines")
    .select("meditation_id, thoughtline_id")
    .in("meditation_id", ids);

  const thoughtlineMap = new Map<string, string[]>();
  thoughtlineLinks?.forEach((t) => {
    const existing = thoughtlineMap.get(t.meditation_id) || [];
    existing.push(t.thoughtline_id);
    thoughtlineMap.set(t.meditation_id, existing);
  });

  const { data: tagLinks } = await supabase
    .from("meditation_tags")
    .select("meditation_id, tag_id")
    .in("meditation_id", ids);

  const tagMap = new Map<string, string[]>();
  tagLinks?.forEach((t) => {
    const existing = tagMap.get(t.meditation_id) || [];
    existing.push(t.tag_id);
    tagMap.set(t.meditation_id, existing);
  });

  const result = meditations.map((m) => ({
    ...m,
    categories: categoryMap.get(m.id) || [],
    thoughtlines: thoughtlineMap.get(m.id) || [],
    tags: tagMap.get(m.id) || [],
  }));

  return Response.json(result);
}

// POST /api/admin/meditations — create new meditation
export async function POST(request: Request) {
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

  if (!medBody || !plain_text) {
    return Response.json(
      { error: "body and plain_text are required" },
      { status: 400 }
    );
  }

  const insertData: Record<string, unknown> = {
    body: medBody,
    plain_text,
    status: status || "draft",
  };

  if (status === "published") {
    insertData.published_at = new Date().toISOString();
  }

  const { data: meditation, error } = await supabase
    .from("meditations")
    .insert(insertData)
    .select()
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  if (categories && categories.length > 0) {
    const rows = categories.map((id: string) => ({
      meditation_id: meditation.id,
      category_id: id,
    }));
    await supabase.from("meditation_categories").insert(rows);
  }

  if (thoughtlines && thoughtlines.length > 0) {
    const rows = thoughtlines.map((id: string) => ({
      meditation_id: meditation.id,
      thoughtline_id: id,
    }));
    await supabase.from("meditation_thoughtlines").insert(rows);
  }

  if (tags && tags.length > 0) {
    const rows = tags.map((id: string) => ({
      meditation_id: meditation.id,
      tag_id: id,
    }));
    await supabase.from("meditation_tags").insert(rows);
  }

  return Response.json(meditation, { status: 201 });
}
