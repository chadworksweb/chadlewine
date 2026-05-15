import { createAdminClient } from "@/lib/supabase-server";
import { sendEmail } from "@/lib/email";

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

  // Fire-and-forget notification to Chad. Failure here doesn't break the
  // public flow — the row is already in the queue for admin review.
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || "chad@chadworks.co";
  void sendEmail({
    to: adminEmail,
    subject: `Unsubscribe request: ${email}`,
    html: `
      <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 540px; margin: 0 auto; padding: 32px 20px; color: #e0e0e8; background: #0a0a14;">
        <p style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#8b9cf7;margin:0 0 8px;">Unsubscribe request</p>
        <h1 style="font-size:20px;font-weight:600;margin:0 0 16px;">${email}</h1>
        ${
          reason
            ? `<p style="font-size:14px;color:#a0a0b0;margin:0 0 12px;">Reason: ${reason.replace(/[<>&]/g, "")}</p>`
            : ""
        }
        ${
          sourcePage
            ? `<p style="font-size:12px;color:#808090;margin:0 0 12px;">Source: ${sourcePage.replace(/[<>&]/g, "")}</p>`
            : ""
        }
        <p style="font-size:13px;color:#a0a0b0;margin:24px 0 0;">
          Review and process at <a href="https://chadlewine.com/admin/subscribers" style="color:#8b9cf7;">chadlewine.com/admin/subscribers</a>
        </p>
      </div>
    `,
  });

  return Response.json({ ok: true });
}
