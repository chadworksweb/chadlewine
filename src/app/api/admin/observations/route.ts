import { createAdminClient } from "@/lib/supabase-server";

// GET /api/admin/observations — list all observations (any status)
export async function GET() {
  const supabase = createAdminClient();

  const { data: observations, error } = await supabase
    .from("observations")
    .select("id, title, slug, status, date_captured, hook_line, tension_line, source, created_at")
    .order("date_captured", { ascending: false });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  // Fetch all domain mappings for these observations
  const ids = observations.map((o) => o.id);
  const { data: domains } = await supabase
    .from("observation_domains")
    .select("observation_id, domain_slug")
    .in("observation_id", ids);

  const domainMap = new Map<string, string[]>();
  domains?.forEach((d) => {
    const existing = domainMap.get(d.observation_id) || [];
    existing.push(d.domain_slug);
    domainMap.set(d.observation_id, existing);
  });

  const result = observations.map((o) => ({
    ...o,
    domains: domainMap.get(o.id) || [],
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
    source,
    domains,
  } = body;

  if (!title || !slug || !obsBody || !date_captured) {
    return Response.json(
      { error: "title, slug, body, and date_captured are required" },
      { status: 400 }
    );
  }

  // Insert observation
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
      source: source || "original",
      published_at: status === "published" ? new Date().toISOString() : null,
    })
    .select()
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  // Insert domain mappings
  if (domains && domains.length > 0) {
    const domainRows = domains.map((d: string) => ({
      observation_id: observation.id,
      domain_slug: d,
    }));
    await supabase.from("observation_domains").insert(domainRows);
  }

  return Response.json(observation, { status: 201 });
}
