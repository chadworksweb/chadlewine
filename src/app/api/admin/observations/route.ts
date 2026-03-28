import { createAdminClient } from "@/lib/supabase-server";

// GET /api/admin/observations — list all observations (any status)
export async function GET() {
  const supabase = createAdminClient();

  const { data: observations, error } = await supabase
    .from("observations")
    .select("id, title, slug, status, date_captured, hook_line, tension_line, created_at")
    .order("date_captured", { ascending: false });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  if (!observations || observations.length === 0) {
    return Response.json([]);
  }

  const ids = observations.map((o) => o.id);

  // Fetch category mappings
  const { data: categoryLinks } = await supabase
    .from("observation_categories")
    .select("observation_id, category_id")
    .in("observation_id", ids);

  const categoryMap = new Map<string, string[]>();
  categoryLinks?.forEach((c) => {
    const existing = categoryMap.get(c.observation_id) || [];
    existing.push(c.category_id);
    categoryMap.set(c.observation_id, existing);
  });

  // Fetch thoughtline mappings
  const { data: thoughtlineLinks } = await supabase
    .from("observation_thoughtlines")
    .select("observation_id, thoughtline_id")
    .in("observation_id", ids);

  const thoughtlineMap = new Map<string, string[]>();
  thoughtlineLinks?.forEach((t) => {
    const existing = thoughtlineMap.get(t.observation_id) || [];
    existing.push(t.thoughtline_id);
    thoughtlineMap.set(t.observation_id, existing);
  });

  // Fetch tag mappings
  const { data: tagLinks } = await supabase
    .from("observation_tags")
    .select("observation_id, tag_id")
    .in("observation_id", ids);

  const tagMap = new Map<string, string[]>();
  tagLinks?.forEach((t) => {
    const existing = tagMap.get(t.observation_id) || [];
    existing.push(t.tag_id);
    tagMap.set(t.observation_id, existing);
  });

  const result = observations.map((o) => ({
    ...o,
    categories: categoryMap.get(o.id) || [],
    thoughtlines: thoughtlineMap.get(o.id) || [],
    tags: tagMap.get(o.id) || [],
  }));

  return Response.json(result);
}

// POST /api/admin/observations — create new observation
export async function POST(request: Request) {
  const supabase = createAdminClient();
  const body = await request.json();

  const {
    title,
    slug,
    body: obsBody,
    date_captured,
    status,
    hook_line,
    tension_line,
    art_image_path,
    art_alt,
    seo_title,
    seo_description,
    categories,
    thoughtlines,
    tags,
    thoughts,
  } = body;

  if (!title || !slug || !obsBody || !date_captured) {
    return Response.json(
      { error: "title, slug, body, and date_captured are required" },
      { status: 400 }
    );
  }

  const { data: observation, error } = await supabase
    .from("observations")
    .insert({
      title,
      slug,
      body: obsBody,
      date_captured,
      status: status || "draft",
      hook_line: hook_line || null,
      tension_line: tension_line || null,
      art_image_path: art_image_path || null,
      art_alt: art_alt || null,
      seo_title: seo_title || null,
      seo_description: seo_description || null,
    })
    .select()
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  // Insert category mappings
  if (categories && categories.length > 0) {
    const rows = categories.map((id: string) => ({
      observation_id: observation.id,
      category_id: id,
    }));
    await supabase.from("observation_categories").insert(rows);
  }

  // Insert thoughtline mappings
  if (thoughtlines && thoughtlines.length > 0) {
    const rows = thoughtlines.map((id: string) => ({
      observation_id: observation.id,
      thoughtline_id: id,
    }));
    await supabase.from("observation_thoughtlines").insert(rows);
  }

  // Insert tag mappings
  if (tags && tags.length > 0) {
    const tagRows = tags.map((t: string) => ({
      observation_id: observation.id,
      tag_id: t,
    }));
    await supabase.from("observation_tags").insert(tagRows);
  }

  // Insert thought mappings
  if (thoughts && thoughts.length > 0) {
    const thoughtRows = thoughts.map((t: string) => ({
      observation_id: observation.id,
      thought_id: t,
    }));
    await supabase.from("observation_thoughts").insert(thoughtRows);
  }

  return Response.json(observation, { status: 201 });
}
