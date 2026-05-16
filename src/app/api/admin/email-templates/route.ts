import { createAdminClient } from "@/lib/supabase-server";

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

export async function POST(req: Request) {
  const body = await req.json();
  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const kind = body.kind === "campaign" ? "campaign" : "transactional";

  if (!slug || !SLUG_RE.test(slug)) {
    return Response.json(
      { error: "Slug must be lowercase letters, digits, and hyphens." },
      { status: 400 },
    );
  }
  if (!name) {
    return Response.json({ error: "Name is required." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: existing } = await supabase
    .from("email_templates")
    .select("slug")
    .eq("slug", slug)
    .maybeSingle();
  if (existing) {
    return Response.json(
      { error: `Slug "${slug}" already exists.` },
      { status: 409 },
    );
  }

  const { data, error } = await supabase
    .from("email_templates")
    .insert({
      slug,
      name,
      kind,
      subject_template: "",
      preheader_template: null,
      body_blocks: [],
    })
    .select()
    .single();
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json(data, { status: 201 });
}
