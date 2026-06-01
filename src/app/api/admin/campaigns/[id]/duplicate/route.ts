import { createAdminClient } from "@/lib/supabase-server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/admin/campaigns/[id]/duplicate -- create a fresh draft pre-filled
// with the source campaign's content (subject, body, sender, audience filter).
// Send stats are NOT copied; the copy starts clean.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return Response.json({ error: "Invalid id" }, { status: 400 });
  }
  const supabase = createAdminClient();

  const { data: src, error } = await supabase
    .from("campaigns")
    .select(
      "subject, preheader, body_html, body_blocks, from_name, from_email, reply_to, audience_filter, category"
    )
    .eq("id", id)
    .single();
  if (error || !src) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const { data, error: insErr } = await supabase
    .from("campaigns")
    .insert({
      subject: src.subject,
      preheader: src.preheader,
      body_html: src.body_html,
      body_blocks: src.body_blocks,
      from_name: src.from_name,
      from_email: src.from_email,
      reply_to: src.reply_to,
      audience_filter: src.audience_filter,
      category: src.category,
      status: "draft",
    })
    .select("id")
    .single();
  if (insErr) {
    return Response.json({ error: insErr.message }, { status: 500 });
  }
  return Response.json({ id: data.id }, { status: 201 });
}
