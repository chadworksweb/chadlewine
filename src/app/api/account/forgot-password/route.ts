import { createClient } from "@supabase/supabase-js";
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

  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const origin = request.headers.get("origin") || process.env.NEXT_PUBLIC_SITE_URL || "https://chadlewine.com";

  const { error } = await anon.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/account/reset-password`,
  });

  await recordAttempt({
    email,
    ip,
    user_agent: ua,
    action: "password_reset",
    success: !error,
    reason: error?.message,
  });

  return Response.json(GENERIC_OK);
}
