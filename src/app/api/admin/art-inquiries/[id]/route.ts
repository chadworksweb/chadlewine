import { createAdminClient } from "@/lib/supabase-server";

const ALLOWED_STATUS = new Set(["new", "responded", "reserved", "won", "lost", "closed"]);

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createAdminClient();
  const body = await request.json().catch(() => ({}));

  const updates: Record<string, unknown> = {};
  if ("status" in body) {
    const s = String(body.status);
    if (!ALLOWED_STATUS.has(s)) return Response.json({ error: "invalid status" }, { status: 400 });
    updates.status = s;
  }
  if ("admin_notes" in body) {
    updates.admin_notes = body.admin_notes ? String(body.admin_notes) : null;
  }
  if (Object.keys(updates).length === 0) {
    return Response.json({ error: "nothing to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("art_inquiries")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}
