import { cookies } from "next/headers";
import { findUserByEmail, setPassword } from "@/lib/clerk-backend";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  ACCESS_TTL_SEC,
  REFRESH_TTL_SEC,
  consumeActionToken,
  createSession,
  revokeAllSessions,
} from "@/lib/session";
import { recordAttempt, clientIp, clientUA } from "@/lib/auth-attempt";

const MIN_PASSWORD = 12;

/* Completes the emailed password-reset flow: single-use token + new
   password in, Clerk password updated, every existing session revoked,
   and a fresh session minted so the reset form can land straight on
   /account (the old flow behaved the same way). */

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const token = typeof body.token === "string" ? body.token : "";
  const password = typeof body.password === "string" ? body.password : "";

  const ip = clientIp(request);
  const ua = clientUA(request);

  if (password.length < MIN_PASSWORD) {
    return Response.json(
      { error: `Password must be at least ${MIN_PASSWORD} characters.` },
      { status: 400 },
    );
  }

  const row = token ? await consumeActionToken("password_reset", token) : null;
  if (!row || !row.user_id) {
    await recordAttempt({ email: row?.email || "unknown", ip, user_agent: ua, action: "password_reset_complete", success: false, reason: "bad_token" });
    return Response.json(
      { error: "This reset link has expired. Request a new one." },
      { status: 400 },
    );
  }

  // The Clerk user id comes from the directory; the external_id check ties
  // it back to the local uuid the token was minted for.
  const user = await findUserByEmail(row.email);
  if (!user || user.external_id !== row.user_id) {
    await recordAttempt({ email: row.email, ip, user_agent: ua, action: "password_reset_complete", success: false, reason: "user_missing" });
    return Response.json(
      { error: "This reset link is no longer valid. Request a new one." },
      { status: 400 },
    );
  }

  const ok = await setPassword(user.id, password);
  if (!ok) {
    await recordAttempt({ email: row.email, ip, user_agent: ua, action: "password_reset_complete", success: false, reason: "clerk_set_failed" });
    return Response.json({ error: "Could not update the password. Try again." }, { status: 500 });
  }

  // A reset invalidates every session that existed before it.
  await revokeAllSessions(row.user_id);
  await recordAttempt({ email: row.email, ip, user_agent: ua, action: "password_reset_complete", success: true });

  const session = await createSession(
    { id: row.user_id, clerkId: user.id, email: row.email },
    { userAgent: ua, ip },
  );
  const cookieStore = await cookies();
  const isProduction = process.env.NODE_ENV === "production";
  cookieStore.set(ACCESS_COOKIE, session.accessToken, {
    httpOnly: true, secure: isProduction, sameSite: "strict", path: "/", maxAge: ACCESS_TTL_SEC,
  });
  cookieStore.set(REFRESH_COOKIE, session.refreshToken, {
    httpOnly: true, secure: isProduction, sameSite: "strict", path: "/", maxAge: REFRESH_TTL_SEC,
  });

  return Response.json({ ok: true });
}
