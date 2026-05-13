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

  // 1 per email per 5 min.
  const rl = await checkRateLimit({ email, ip, action: "password_reset" });
  if (!rl.allowed) {
    await recordAttempt({ email, ip, user_agent: ua, action: "password_reset", success: false, reason: rl.reason });
    // Still generic — don't leak whether we're rate-limiting them or them
    // specifically (account enumeration).
    return Response.json(GENERIC_OK);
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
