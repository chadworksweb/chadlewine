import { findUserByEmail } from "@/lib/clerk-backend";
import { createActionToken } from "@/lib/session";
import { sendEmail, buildPasswordResetEmailHtml } from "@/lib/email";
import { checkRateLimit } from "@/lib/rate-limit";
import { recordAttempt, clientIp, clientUA } from "@/lib/auth-attempt";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Generic response — same shape regardless of whether email exists.
const GENERIC_OK = {
  ok: true,
  message: "If an account exists for that email, a reset link is on the way.",
};

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

  const ip = clientIp(request);
  const ua = clientUA(request);

  if (!EMAIL_RE.test(email)) {
    return Response.json({ error: "Valid email required." }, { status: 400 });
  }

  // 1 per email per 2 min — chad's preference is to surface the limit to the
  // user when hit, since the silent "OK" looks like a delivery failure. This
  // does leak "someone tried this email recently" but not "this email exists",
  // so the enumeration risk is minor.
  const rl = await checkRateLimit({ email, ip, action: "password_reset" });
  if (!rl.allowed) {
    await recordAttempt({ email, ip, user_agent: ua, action: "password_reset", success: false, reason: rl.reason });
    const waitSec = rl.retryAfter ?? 120;
    const waitMin = Math.max(1, Math.ceil(waitSec / 60));
    return Response.json(
      {
        error: `Too many reset requests for this email. Try again in ${waitMin} minute${waitMin === 1 ? "" : "s"}.`,
        retryAfter: waitSec,
      },
      { status: 429, headers: rl.retryAfter ? { "Retry-After": String(rl.retryAfter) } : {} }
    );
  }

  const origin = request.headers.get("origin") || process.env.NEXT_PUBLIC_SITE_URL || "https://chadlewine.com";

  // Our own token flow since the Supabase exit: only send when the account
  // actually exists, but answer identically either way so nothing leaks.
  let sent = false;
  let reason: string | undefined;
  try {
    const user = await findUserByEmail(email);
    if (user?.external_id) {
      const token = await createActionToken("password_reset", email, user.external_id, 60 * 30);
      sent = await sendEmail({
        to: email,
        subject: "Reset your chadlewine.com password",
        html: buildPasswordResetEmailHtml({
          resetUrl: `${origin}/account/reset-password?token=${token}`,
        }),
      });
      if (!sent) reason = "send_failed";
    } else {
      reason = "no_account";
    }
  } catch (e) {
    reason = e instanceof Error ? e.message : "error";
  }

  await recordAttempt({
    email,
    ip,
    user_agent: ua,
    action: "password_reset",
    success: sent,
    reason,
  });

  return Response.json(GENERIC_OK);
}
