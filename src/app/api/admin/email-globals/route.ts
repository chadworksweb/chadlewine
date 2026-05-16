import { createAdminClient } from "@/lib/supabase-server";

export async function GET() {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("email_globals")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  return Response.json(data ?? { header_blocks: [], footer_blocks: [] });
}

export async function PUT(req: Request) {
  const body = await req.json();
  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (Array.isArray(body.header_blocks)) update.header_blocks = body.header_blocks;
  if (Array.isArray(body.footer_blocks)) update.footer_blocks = body.footer_blocks;

  const supabase = createAdminClient();
  // Upsert to handle the case where the singleton row hasn't been seeded
  // yet (e.g. migration applied without the seed insert running).
  const { data, error } = await supabase
    .from("email_globals")
    .upsert({ id: 1, ...update })
    .select()
    .single();
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json(data);
}

// Preview endpoint: accepts ad-hoc blocks + vars and returns rendered HTML.
// Lets the editor render the live preview without saving first.
export async function POST(req: Request) {
  const body = await req.json();
  const { renderPreview } = await import("@/lib/email-blocks");
  const supabase = createAdminClient();
  const { data: g } = await supabase
    .from("email_globals")
    .select("header_blocks, footer_blocks")
    .eq("id", 1)
    .maybeSingle();
  const globals = {
    header_blocks: g?.header_blocks ?? [],
    footer_blocks: g?.footer_blocks ?? [],
  };
  const rendered = renderPreview(
    Array.isArray(body.blocks) ? body.blocks : [],
    body.use_globals === false ? { header_blocks: [], footer_blocks: [] } : globals,
    body.subject || "Preview",
    body.preheader || null,
    body.vars || {},
  );
  return Response.json(rendered);
}
