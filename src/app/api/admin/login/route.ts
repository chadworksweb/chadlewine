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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GENERIC_ERR = "Invalid credentials";

// Same hardening as /api/account/login, but admin-only — caller is the
// /cl-admin-6nnn page. No Turnstile (URL already obscure). Stricter rate
// limits per the admin_login policy in rate-limit.ts.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  const ip = clientIp(request);
  const ua = clientUA(request);

  if (!EMAIL_RE.test(email) || !password) {
    return Response.json({ error: GENERIC_ERR }, { status: 400 });
  }

  const lock = await checkLockout(email);
  if (lock.locked) {
    await recordAttempt({ email, ip, user_agent: ua, action: "admin_login", success: false, reason: "locked" });
    return Response.json(
      { error: "Account temporarily locked. Try again later.", retryAfter: lock.retryAfter },
      { status: 423, headers: lock.retryAfter ? { "Retry-After": String(lock.retryAfter) } : {} }
    );
  }

  const rl = await checkRateLimit({ email, ip, action: "admin_login" });
  if (!rl.allowed) {
    await recordAttempt({ email, ip, user_agent: ua, action: "admin_login", success: false, reason: rl.reason });
    return Response.json(
      { error: "Too many attempts. Wait a few minutes.", retryAfter: rl.retryAfter },
      { status: 429, headers: rl.retryAfter ? { "Retry-After": String(rl.retryAfter) } : {} }
    );
  }

  // Authenticate via Clerk's backend API (user directory + password
  // verifier since the Supabase exit). Unverified email reads as a plain
  // failure here — the admin URL never explains itself.
  const auth = await authenticate(email, password);
  if (!auth.ok) {
    await recordFailure(email);
    await recordAttempt({ email, ip, user_agent: ua, action: "admin_login", success: false, reason: "wrong_password" });
    return Response.json({ error: GENERIC_ERR }, { status: 401 });
  }

  // Confirm this user is actually an admin. The proxy will block anyway,
  // but the login page shouldn't establish a session for non-admins.
  const admin = createAdminClient();
  const { data: adminRow } = await admin
    .from("admins")
    .select("user_id")
    .eq("user_id", auth.localId)
    .maybeSingle();
  if (!adminRow) {
    await recordAttempt({ email, ip, user_agent: ua, action: "admin_login", success: false, reason: "not_admin" });
    return Response.json({ error: GENERIC_ERR }, { status: 401 });
  }

  await clearLockout(email);
  await recordAttempt({ email, ip, user_agent: ua, action: "admin_login", success: true });

  const session = await createSession(
    { id: auth.localId, clerkId: auth.clerkId, email: auth.email },
    { userAgent: ua, ip },
  );

  const cookieStore = await cookies();
  const isProduction = process.env.NODE_ENV === "production";
  // Admin cookies stay SameSite=Lax (admin URL might be navigated to from
  // bookmarks/external — Strict would block top-level GET).
  cookieStore.set(ACCESS_COOKIE, session.accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: ACCESS_TTL_SEC,
  });
  cookieStore.set(REFRESH_COOKIE, session.refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: REFRESH_TTL_SEC,
  });

  return Response.json({ user: { id: auth.localId, email: auth.email } });
}
