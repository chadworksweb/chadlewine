import { createAdminClient } from "@/lib/supabase-server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// PATCH /api/admin/subscribers/[id] — flip a subscriber between
// 'active' and 'unsubscribed'. Optionally accepts a `request_id` so we
// can mark a matching unsubscribe_request as processed in the same call.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return Response.json({ error: "Invalid id" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const status = body.status === "active" ? "active" : "unsubscribed";
  const requestId =
    typeof body.request_id === "string" && UUID_RE.test(body.request_id)
      ? body.request_id
      : null;

  const supabase = createAdminClient();

  const update: Record<string, unknown> = { status };
  if (status === "unsubscribed") update.unsubscribed_at = new Date().toISOString();
  if (status === "active") update.unsubscribed_at = null;

  const { data, error } = await supabase
    .from("subscribers")
    .update(update)
    .eq("id", id)
    .select("id, email, status, unsubscribed_at")
    .single();

  if (error || !data) {
    return Response.json({ error: error?.message || "Not found" }, { status: 404 });
  }

  // If we just unsubscribed and a request was passed, mark it processed.
  if (status === "unsubscribed" && requestId) {
    await supabase
      .from("unsubscribe_requests")
      .update({
        status: "processed",
        processed_at: new Date().toISOString(),
        processed_subscriber_id: id,
      })
      .eq("id", requestId);
  }

  return Response.json(data);
}
