import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase-server";
import { checkRateLimit } from "@/lib/rate-limit";
import { checkLockout, recordFailure, clearLockout } from "@/lib/lockout";
import { recordAttempt, clientIp, clientUA } from "@/lib/auth-attempt";
import { verifyTurnstile } from "@/lib/turnstile";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GENERIC_ERR = "Invalid credentials";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const turnstileToken =
    typeof body.turnstile_token === "string" ? body.turnstile_token : null;

  const ip = clientIp(request);
  const ua = clientUA(request);

  if (!EMAIL_RE.test(email) || !password) {
    return Response.json({ error: GENERIC_ERR }, { status: 400 });
  }

  // 1. Lockout check — fastest gate.
  const lock = await checkLockout(email);
  if (lock.locked) {
    await recordAttempt({ email, ip, user_agent: ua, action: "login", success: false, reason: "locked" });
    return Response.json(
      {
        error: "Account temporarily locked. Try again later.",
        retryAfter: lock.retryAfter,
      },
      { status: 423, headers: lock.retryAfter ? { "Retry-After": String(lock.retryAfter) } : {} }
    );
  }

  // 2. Rate limit.
  const rl = await checkRateLimit({ email, ip, action: "login" });
  if (!rl.allowed) {
    await recordAttempt({ email, ip, user_agent: ua, action: "login", success: false, reason: rl.reason });
    return Response.json(
      { error: "Too many attempts. Wait a few minutes.", retryAfter: rl.retryAfter },
      { status: 429, headers: rl.retryAfter ? { "Retry-After": String(rl.retryAfter) } : {} }
    );
  }

  // 3. Turnstile (no-op if not configured).
  const tsOk = await verifyTurnstile(turnstileToken, ip);
  if (!tsOk) {
    await recordAttempt({ email, ip, user_agent: ua, action: "login", success: false, reason: "turnstile_failed" });
    return Response.json({ error: "Bot check failed. Refresh and try again." }, { status: 400 });
  }

  // 4. Authenticate via Supabase. The browser SDK normally does this; we
  //    proxy it server-side so we can wrap with our gates + audit log.
  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const { data, error } = await anon.auth.signInWithPassword({ email, password });

  if (error || !data.session || !data.user) {
    const { lockedNow } = await recordFailure(email);
    await recordAttempt({
      email,
      ip,
      user_agent: ua,
      action: "login",
      success: false,
      reason: lockedNow ? "wrong_password_now_locked" : "wrong_password",
    });
    return Response.json({ error: GENERIC_ERR }, { status: 401 });
  }

  // 5. Reject admins — they must use /cl-admin-6nnn instead.
  const admin = createAdminClient();
  const { data: adminRow } = await admin
    .from("admins")
    .select("user_id")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (adminRow) {
    await recordAttempt({ email, ip, user_agent: ua, action: "login", success: false, reason: "admin_blocked_on_public_login" });
    return Response.json(
      { error: "This account isn't available here. Use your admin URL." },
      { status: 403 }
    );
  }

  // 6. Success — clear lockout, set cookies, return user.
  await clearLockout(email);
  await recordAttempt({ email, ip, user_agent: ua, action: "login", success: true });

  const cookieStore = await cookies();
  const isProduction = process.env.NODE_ENV === "production";
  cookieStore.set("sb-access-token", data.session.access_token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60,
  });
  cookieStore.set("sb-refresh-token", data.session.refresh_token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return Response.json({
    user: { id: data.user.id, email: data.user.email },
  });
}
