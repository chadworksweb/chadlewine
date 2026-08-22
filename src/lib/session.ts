/* The app's own sessions, replacing Supabase Auth's tokens (2026-08-22).

   Shape matches what the site always had: a 1-hour access token in the
   sb-access-token cookie and a 30-day rotating refresh token in
   sb-refresh-token (cookie names kept from the Supabase era so nothing
   else had to move). The access token is an HS256 JWT signed with
   SESSION_JWT_SECRET; the refresh token is opaque, stored only as a
   SHA-256 hash in public.auth_sessions, and rotates on every use.

   WebCrypto only (no node:crypto) so proxy.ts can verify tokens too. */

import { createAdminClient } from "@/lib/supabase-server";

export const ACCESS_COOKIE = "sb-access-token";
export const REFRESH_COOKIE = "sb-refresh-token";
export const ACCESS_TTL_SEC = 60 * 60;
export const REFRESH_TTL_SEC = 60 * 60 * 24 * 30;

export interface SessionClaims {
  /* auth.users.id -- the uuid audience/admins key on */
  sub: string;
  /* Clerk user id (user_...) */
  cid: string;
  email: string;
  exp: number;
}

const enc = new TextEncoder();

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function b64urlDecode(s: string): Uint8Array | null {
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

async function hmacKey(): Promise<CryptoKey> {
  const secret = process.env.SESSION_JWT_SECRET;
  if (!secret) throw new Error("SESSION_JWT_SECRET is not set");
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function mintAccessToken(
  claims: Omit<SessionClaims, "exp">,
  ttlSec: number = ACCESS_TTL_SEC,
): Promise<string> {
  const header = b64url(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload = b64url(
    enc.encode(
      JSON.stringify({
        ...claims,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + ttlSec,
        iss: "chadlewine",
      }),
    ),
  );
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(), enc.encode(`${header}.${payload}`));
  return `${header}.${payload}.${b64url(sig)}`;
}

export async function verifyAccessToken(token: string): Promise<SessionClaims | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const sig = b64urlDecode(parts[2]);
  if (!sig) return null;
  const ok = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(),
    sig as unknown as ArrayBuffer,
    enc.encode(`${parts[0]}.${parts[1]}`),
  );
  if (!ok) return null;
  const payloadBytes = b64urlDecode(parts[1]);
  if (!payloadBytes) return null;
  try {
    const claims = JSON.parse(new TextDecoder().decode(payloadBytes)) as SessionClaims & {
      iss?: string;
    };
    if (claims.iss !== "chadlewine") return null;
    if (!claims.sub || !claims.exp || claims.exp < Math.floor(Date.now() / 1000)) return null;
    return claims;
  } catch {
    return null;
  }
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface MintedSession {
  accessToken: string;
  refreshToken: string;
}

/* Creates the DB-backed session and returns both tokens. Caller sets the
   cookies (route handlers via cookies(), the proxy via response.cookies). */
export async function createSession(
  user: { id: string; clerkId: string; email: string },
  meta?: { userAgent?: string | null; ip?: string | null },
): Promise<MintedSession> {
  const refreshToken = randomToken();
  const admin = createAdminClient();
  const { error } = await admin.from("auth_sessions").insert({
    user_id: user.id,
    clerk_user_id: user.clerkId,
    refresh_hash: await sha256Hex(refreshToken),
    expires_at: new Date(Date.now() + REFRESH_TTL_SEC * 1000).toISOString(),
    user_agent: meta?.userAgent?.slice(0, 400) || null,
    ip: meta?.ip || null,
  });
  if (error) throw new Error(`auth_sessions insert failed: ${error.message}`);
  const accessToken = await mintAccessToken({ sub: user.id, cid: user.clerkId, email: user.email });
  return { accessToken, refreshToken };
}

/* Refresh-token exchange with rotation: the presented token must match a
   live session row; the row gets a new hash and a slid expiry, and a fresh
   access token is minted. Returns null for unknown/expired tokens. */
export async function rotateSession(refreshToken: string): Promise<MintedSession | null> {
  const admin = createAdminClient();
  const hash = await sha256Hex(refreshToken);
  const { data: row } = await admin
    .from("auth_sessions")
    .select("id, user_id, clerk_user_id")
    .eq("refresh_hash", hash)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (!row) return null;

  const newRefresh = randomToken();
  const { data: updated } = await admin
    .from("auth_sessions")
    .update({
      refresh_hash: await sha256Hex(newRefresh),
      expires_at: new Date(Date.now() + REFRESH_TTL_SEC * 1000).toISOString(),
      last_used_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .eq("refresh_hash", hash) // lost race with a concurrent rotation = no rows
    .select("id")
    .maybeSingle();
  if (!updated) return null;

  const { data: u } = await admin
    .from("audience")
    .select("email")
    .eq("user_id", row.user_id)
    .maybeSingle();

  const accessToken = await mintAccessToken({
    sub: row.user_id,
    cid: row.clerk_user_id,
    email: u?.email || "",
  });
  return { accessToken, refreshToken: newRefresh };
}

export async function revokeSession(refreshToken: string): Promise<void> {
  const admin = createAdminClient();
  await admin.from("auth_sessions").delete().eq("refresh_hash", await sha256Hex(refreshToken));
}

export async function revokeAllSessions(userId: string): Promise<void> {
  const admin = createAdminClient();
  await admin.from("auth_sessions").delete().eq("user_id", userId);
}

/* --- one-time action tokens (password reset, email verify, email change) --- */

export type ActionPurpose = "password_reset" | "email_verify" | "email_change";

export async function createActionToken(
  purpose: ActionPurpose,
  email: string,
  userId: string | null,
  ttlSec: number,
  payload?: Record<string, unknown>,
): Promise<string> {
  const token = randomToken();
  const admin = createAdminClient();
  const { error } = await admin.from("auth_action_tokens").insert({
    user_id: userId,
    email,
    purpose,
    token_hash: await sha256Hex(token),
    payload: payload || null,
    expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
  });
  if (error) throw new Error(`auth_action_tokens insert failed: ${error.message}`);
  return token;
}

export interface ActionTokenRow {
  id: string;
  user_id: string | null;
  email: string;
  purpose: ActionPurpose;
  payload: Record<string, unknown> | null;
}

/* Single-use: consuming marks used_at, and a token that is expired or
   already used comes back null. */
export async function consumeActionToken(
  purpose: ActionPurpose,
  token: string,
): Promise<ActionTokenRow | null> {
  const admin = createAdminClient();
  const hash = await sha256Hex(token);
  const { data: row } = await admin
    .from("auth_action_tokens")
    .select("id, user_id, email, purpose, payload")
    .eq("token_hash", hash)
    .eq("purpose", purpose)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (!row) return null;
  const { data: marked } = await admin
    .from("auth_action_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("used_at", null)
    .select("id")
    .maybeSingle();
  if (!marked) return null;
  return row as ActionTokenRow;
}
