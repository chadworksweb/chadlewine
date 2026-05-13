import { createClient } from "@supabase/supabase-js";
import { checkRateLimit } from "@/lib/rate-limit";
import { recordAttempt, clientIp, clientUA } from "@/lib/auth-attempt";
import { verifyTurnstile } from "@/lib/turnstile";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 12;

// Generic response shape — same for success, for "email exists", and for
// honeypot-trapped bots. Prevents account-enumeration.
const GENERIC_OK_RESPONSE = {
  ok: true,
  message: "Check your email to confirm your account.",
};

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const turnstileToken =
    typeof body.turnstile_token === "string" ? body.turnstile_token : null;
  const honeypot = typeof body.honeypot === "string" ? body.honeypot : "";

  const ip = clientIp(request);
  const ua = clientUA(request);

  // Honeypot — any value here means a bot filled an invisible field.
  // Return the same generic success response so the bot moves on.
  if (honeypot) {
    await recordAttempt({ email, ip, user_agent: ua, action: "register", success: false, reason: "honeypot" });
    return Response.json(GENERIC_OK_RESPONSE);
  }

  if (!EMAIL_RE.test(email)) {
    return Response.json({ error: "Valid email required." }, { status: 400 });
  }
  if (password.length < MIN_PASSWORD) {
    return Response.json(
      { error: `Password must be at least ${MIN_PASSWORD} characters.` },
      { status: 400 }
    );
  }

  // Per-IP register cap.
  const rl = await checkRateLimit({ email, ip, action: "register" });
  if (!rl.allowed) {
    await recordAttempt({ email, ip, user_agent: ua, action: "register", success: false, reason: rl.reason });
    return Response.json(
      { error: "Too many signup attempts. Try again later.", retryAfter: rl.retryAfter },
      { status: 429, headers: rl.retryAfter ? { "Retry-After": String(rl.retryAfter) } : {} }
    );
  }

  // Turnstile (no-op if not configured).
  const tsOk = await verifyTurnstile(turnstileToken, ip);
  if (!tsOk) {
    await recordAttempt({ email, ip, user_agent: ua, action: "register", success: false, reason: "turnstile_failed" });
    return Response.json({ error: "Bot check failed. Refresh and try again." }, { status: 400 });
  }

  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Determine the public origin for the email confirmation link. Trust
  // the request's Origin header (Vercel sets it correctly per env).
  const origin = request.headers.get("origin") || process.env.NEXT_PUBLIC_SITE_URL || "https://chadlewine.com";

  const { data, error } = await anon.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${origin}/account` },
  });

  if (error) {
    // Log but DON'T reveal — return the generic success response so the
    // attacker can't tell whether the email already existed.
    await recordAttempt({ email, ip, user_agent: ua, action: "register", success: false, reason: error.message });
    return Response.json(GENERIC_OK_RESPONSE);
  }

  await recordAttempt({ email, ip, user_agent: ua, action: "register", success: true });
  // data.session may be non-null if email confirmations are disabled —
  // but we'll still tell the user to check email, keeping a single shape.
  return Response.json(GENERIC_OK_RESPONSE);
}
