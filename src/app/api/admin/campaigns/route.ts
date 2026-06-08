import { createAdminClient } from "@/lib/supabase-server";

// GET /api/admin/campaigns — list all campaigns
export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("campaigns")
    .select(
      "id, subject, status, sent_count, failed_count, sent_at, created_at, updated_at"
    )
    .order("created_at", { ascending: false });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json(data || []);
}

// POST /api/admin/campaigns — create a new draft campaign
export async function POST(request: Request) {
  const supabase = createAdminClient();
  const body = await request.json().catch(() => ({}));

  const insert = {
    subject: body.subject || "",
    preheader: body.preheader ?? null,
    body_html: body.body_html || "",
    from_name: body.from_name || process.env.EMAIL_FROM_NAME || "Chad Lewine",
    from_email:
      body.from_email ||
      process.env.EMAIL_FROM_ADDRESS ||
      process.env.EMAIL_FROM ||
      "site@chadlewine.com",
    reply_to: body.reply_to ?? process.env.EMAIL_REPLY_TO ?? null,
    status: "draft",
  };

  const { data, error } = await supabase
    .from("campaigns")
    .insert(insert)
    .select()
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json(data, { status: 201 });
}
