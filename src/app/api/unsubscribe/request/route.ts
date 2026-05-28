import { createAdminClient } from "@/lib/supabase-server";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/unsubscribe/request — public, no auth, no token required.
// Used when the token-based link can't find a subscriber (mistyped, old
// link, manually forwarded email). Logs to unsubscribe_requests for admin
// to review and act on, and notifies Chad immediately.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const reason = typeof body.reason === "string" ? body.reason : null;
  const sourcePage =
    typeof body.source_page === "string" ? body.source_page : null;

  if (!EMAIL_RE.test(email)) {
    return Response.json({ error: "Valid email required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // De-dupe: if there's already a pending request for this email, do
  // nothing — return 200 so the user sees the same confirmation.
  const { data: existing } = await supabase
    .from("unsubscribe_requests")
    .select("id")
    .eq("email", email)
    .eq("status", "pending")
    .maybeSingle();

  if (existing) {
    return Response.json({ ok: true, deduped: true });
  }

  const { error } = await supabase.from("unsubscribe_requests").insert({
    email,
    reason,
    source_page: sourcePage,
    status: "pending",
  });
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  // No admin email notification (per preference) -- the request is queued in
  // unsubscribe_requests for review at /admin/subscribers.
  return Response.json({ ok: true });
}
