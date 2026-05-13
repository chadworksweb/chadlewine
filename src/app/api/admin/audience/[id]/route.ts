import { createAdminClient } from "@/lib/supabase-server";
import {
  setDisplayName,
  setMailingAddress,
  setNotes,
  setSubscriberStatus,
} from "@/lib/audience";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    .from("audience")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const { data: tags } = await supabase
    .from("audience_tags")
    .select("tag, added_at")
    .eq("audience_id", id)
    .order("added_at", { ascending: false });
  return Response.json({ ...data, tags: tags || [] });
}

// PATCH — update display_name, mailing address, notes, or subscriber_status.
// Each goes through the audience helper so events are emitted.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return Response.json({ error: "Invalid id" }, { status: 400 });
  }
  const body = await request.json().catch(() => ({}));

  if (typeof body.display_name === "string") {
    await setDisplayName(id, body.display_name);
  }
  if (body.mailing_address && typeof body.mailing_address === "object") {
    await setMailingAddress(id, body.mailing_address);
  }
  if (typeof body.notes === "string") {
    await setNotes(id, body.notes);
  }
  if (body.subscriber_status === "active" || body.subscriber_status === "unsubscribed") {
    await setSubscriberStatus(id, body.subscriber_status);
  }

  // Optional: mark a matching unsubscribe_request as processed in the
  // same admin action ("Unsubscribe + archive" button on the Active tab).
  if (body.request_id && UUID_RE.test(body.request_id)) {
    const supabase = createAdminClient();
    await supabase
      .from("unsubscribe_requests")
      .update({
        status: "processed",
        processed_at: new Date().toISOString(),
        processed_subscriber_id: id, // Reusing the column for audience_id semantically.
      })
      .eq("id", body.request_id);
  }

  return Response.json({ ok: true });
}

// DELETE — hard delete. Audit trail via on_delete cascades.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return Response.json({ error: "Invalid id" }, { status: 400 });
  }
  const supabase = createAdminClient();
  const { error } = await supabase.from("audience").delete().eq("id", id);
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true });
}
