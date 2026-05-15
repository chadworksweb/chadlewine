import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase-server";
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

  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const { data, error } = await anon.auth.signInWithPassword({ email, password });

  if (error || !data.session || !data.user) {
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
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (!adminRow) {
    await recordAttempt({ email, ip, user_agent: ua, action: "admin_login", success: false, reason: "not_admin" });
    return Response.json({ error: GENERIC_ERR }, { status: 401 });
  }

  await clearLockout(email);
  await recordAttempt({ email, ip, user_agent: ua, action: "admin_login", success: true });

  const cookieStore = await cookies();
  const isProduction = process.env.NODE_ENV === "production";
  // Admin cookies stay SameSite=Lax (admin URL might be navigated to from
  // bookmarks/external — Strict would block top-level GET).
  cookieStore.set("sb-access-token", data.session.access_token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60,
  });
  cookieStore.set("sb-refresh-token", data.session.refresh_token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return Response.json({ user: { id: data.user.id, email: data.user.email } });
}
