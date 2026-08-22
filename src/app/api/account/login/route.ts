import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase-server";
import { authenticate } from "@/lib/clerk-backend";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  ACCESS_TTL_SEC,
  REFRESH_TTL_SEC,
  createSession,
} from "@/lib/session";
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

  // 4. Authenticate via Clerk's backend API (the user directory + password
  //    verifier since the Supabase exit). Server-side so our gates +
  //    audit log wrap it, exactly as before.
  const auth = await authenticate(email, password);

  if (!auth.ok && auth.reason === "unverified") {
    await recordAttempt({ email, ip, user_agent: ua, action: "login", success: false, reason: "email_unverified" });
    return Response.json(
      { error: "Confirm your email first — check your inbox for the confirmation link." },
      { status: 403 }
    );
  }
  if (!auth.ok) {
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
    .eq("user_id", auth.localId)
    .maybeSingle();
  if (adminRow) {
    await recordAttempt({ email, ip, user_agent: ua, action: "login", success: false, reason: "admin_blocked_on_public_login" });
    return Response.json(
      { error: "This account isn't available here. Use your admin URL." },
      { status: 403 }
    );
  }

  // 6. Success — clear lockout, mint our session, set cookies, return user.
  await clearLockout(email);
  await recordAttempt({ email, ip, user_agent: ua, action: "login", success: true });

  const session = await createSession(
    { id: auth.localId, clerkId: auth.clerkId, email: auth.email },
    { userAgent: ua, ip },
  );

  const cookieStore = await cookies();
  const isProduction = process.env.NODE_ENV === "production";
  cookieStore.set(ACCESS_COOKIE, session.accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/",
    maxAge: ACCESS_TTL_SEC,
  });
  cookieStore.set(REFRESH_COOKIE, session.refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/",
    maxAge: REFRESH_TTL_SEC,
  });

  return Response.json({
    user: { id: auth.localId, email: auth.email },
  });
}
