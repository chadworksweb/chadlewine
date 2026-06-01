import { createAdminClient } from "@/lib/supabase-server";
import { isValidCategory } from "@/lib/notification-categories";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/admin/campaigns/[id]
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return Response.json({ error: "Invalid id" }, { status: 400 });
  }
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  return Response.json(data);
}

// PUT /api/admin/campaigns/[id] — autosave update
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return Response.json({ error: "Invalid id" }, { status: 400 });
  }
  const supabase = createAdminClient();
  const body = await request.json();

  // Whitelist editable fields — never let the client flip status, sent_at,
  // or counters here. Send/Test routes manage those.
  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (typeof body.subject === "string") update.subject = body.subject;
  if (body.preheader !== undefined) update.preheader = body.preheader;
  if (typeof body.body_html === "string") update.body_html = body.body_html;
  if (Array.isArray(body.body_blocks) || body.body_blocks === null) {
    update.body_blocks = body.body_blocks;
  }
  if (typeof body.from_name === "string") update.from_name = body.from_name;
  if (typeof body.from_email === "string") update.from_email = body.from_email;
  if (body.reply_to !== undefined) update.reply_to = body.reply_to;
  if (body.audience_filter !== undefined)
    update.audience_filter = body.audience_filter;
  if (typeof body.category === "string" && isValidCategory(body.category))
    update.category = body.category;
  // cta_label/cta_url retired in favor of button blocks in body_blocks.
  // Legacy values on existing rows are read once by CampaignEditor's
  // useState initializer to seed a button block, then ignored.

  const { data, error } = await supabase
    .from("campaigns")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json(data);
}

// DELETE /api/admin/campaigns/[id]
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return Response.json({ error: "Invalid id" }, { status: 400 });
  }
  const supabase = createAdminClient();
  // Only allow deleting drafts. Sent campaigns are part of the record.
  const { data: existing } = await supabase
    .from("campaigns")
    .select("status")
    .eq("id", id)
    .single();
  if (!existing) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  if (existing.status !== "draft") {
    return Response.json(
      { error: "Only draft campaigns can be deleted." },
      { status: 409 }
    );
  }
  const { error } = await supabase.from("campaigns").delete().eq("id", id);
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true });
}
