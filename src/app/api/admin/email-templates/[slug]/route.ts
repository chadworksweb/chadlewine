import { createAdminClient } from "@/lib/supabase-server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("email_templates")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error || !data) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  return Response.json(data);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("email_templates")
    .delete()
    .eq("slug", slug);
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const body = await req.json();
  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (typeof body.name === "string") update.name = body.name;
  if (typeof body.subject_template === "string") update.subject_template = body.subject_template;
  if (body.preheader_template !== undefined) update.preheader_template = body.preheader_template;
  if (Array.isArray(body.body_blocks)) update.body_blocks = body.body_blocks;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("email_templates")
    .update(update)
    .eq("slug", slug)
    .select()
    .single();
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json(data);
}
