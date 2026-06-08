import { createAdminClient } from "@/lib/supabase-server";

// GET /api/admin/writings — list all posts (any status).
// Optional ?kind=observation|journal filters by content kind.
export async function GET(request: Request) {
  const supabase = createAdminClient();

  const kindParam = new URL(request.url).searchParams.get("kind");

  let query = supabase
    .from("posts")
    .select("id, title, slug, status, kind, date_captured, hook_line, tension_line, created_at")
    .order("date_captured", { ascending: false });

  if (kindParam === "observation" || kindParam === "journal") {
    query = query.eq("kind", kindParam);
  }

  const { data: observations, error } = await query;

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  if (!observations || observations.length === 0) {
    return Response.json([]);
  }

  const ids = observations.map((o) => o.id);

  // Fetch category mappings
  const { data: categoryLinks } = await supabase
    .from("post_categories")
    .select("post_id, category_id")
    .in("post_id", ids);

  const categoryMap = new Map<string, string[]>();
  categoryLinks?.forEach((c) => {
    const existing = categoryMap.get(c.post_id) || [];
    existing.push(c.category_id);
    categoryMap.set(c.post_id, existing);
  });

  // Fetch thoughtline mappings
  const { data: thoughtlineLinks } = await supabase
    .from("post_thoughtlines")
    .select("post_id, thoughtline_id")
    .in("post_id", ids);

  const thoughtlineMap = new Map<string, string[]>();
  thoughtlineLinks?.forEach((t) => {
    const existing = thoughtlineMap.get(t.post_id) || [];
    existing.push(t.thoughtline_id);
    thoughtlineMap.set(t.post_id, existing);
  });

  // Fetch tag mappings
  const { data: tagLinks } = await supabase
    .from("post_tags")
    .select("post_id, tag_id")
    .in("post_id", ids);

  const tagMap = new Map<string, string[]>();
  tagLinks?.forEach((t) => {
    const existing = tagMap.get(t.post_id) || [];
    existing.push(t.tag_id);
    tagMap.set(t.post_id, existing);
  });

  const result = observations.map((o) => ({
    ...o,
    categories: categoryMap.get(o.id) || [],
    thoughtlines: thoughtlineMap.get(o.id) || [],
    tags: tagMap.get(o.id) || [],
  }));

  return Response.json(result);
}

// POST /api/admin/writings — create new post
export async function POST(request: Request) {
  const supabase = createAdminClient();
  const body = await request.json();

  const {
    title,
    slug,
    body: obsBody,
    date_captured,
    status,
    kind,
    hook_line,
    tension_line,
    art_image_path,
    art_alt,
    seo_title,
    seo_description,
    categories,
    thoughtlines,
    tags,
  } = body;

  if (!title || !slug || !obsBody || !date_captured) {
    return Response.json(
      { error: "title, slug, body, and date_captured are required" },
      { status: 400 }
    );
  }

  const { data: observation, error } = await supabase
    .from("posts")
    .insert({
      title,
      slug,
      body: obsBody,
      date_captured,
      status: status || "draft",
      kind: kind === "journal" ? "journal" : "observation",
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
      post_id: observation.id,
      category_id: id,
    }));
    await supabase.from("post_categories").insert(rows);
  }

  // Insert thoughtline mappings
  if (thoughtlines && thoughtlines.length > 0) {
    const rows = thoughtlines.map((id: string) => ({
      post_id: observation.id,
      thoughtline_id: id,
    }));
    await supabase.from("post_thoughtlines").insert(rows);
  }

  // Insert tag mappings
  if (tags && tags.length > 0) {
    const tagRows = tags.map((t: string) => ({
      post_id: observation.id,
      tag_id: t,
    }));
    await supabase.from("post_tags").insert(tagRows);
  }

  return Response.json(observation, { status: 201 });
}
