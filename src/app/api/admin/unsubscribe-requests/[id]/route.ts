import { createAdminClient } from "@/lib/supabase-server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// PATCH /api/admin/unsubscribe-requests/[id] — dismiss or mark processed
// without changing a subscriber. Used when a request comes in for an
// email that isn't in our subscribers table at all.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return Response.json({ error: "Invalid id" }, { status: 400 });
  }
  const body = await request.json().catch(() => ({}));
  const status: "processed" | "dismissed" =
    body.status === "dismissed" ? "dismissed" : "processed";

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("unsubscribe_requests")
    .update({
      status,
      processed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json(data);
}
