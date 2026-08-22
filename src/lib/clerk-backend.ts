/* Thin Clerk Backend API client. Clerk is the user directory and password
   verifier since the 2026-08 Supabase Auth exit; sessions stay this app's
   own (see session.ts), so the full Clerk SDK is never loaded -- these are
   the only five things Clerk does for us.

   Every user carries external_id = the local auth.users uuid the rest of
   the schema keys on (imported users keep their old Supabase uuid; new
   signups get a fresh one minted by the register route). */

const API = "https://api.clerk.com/v1";

export interface ClerkUser {
  id: string;
  external_id: string | null;
  email: string | null;
  emailAddressId: string | null;
  emailVerified: boolean;
}

interface ClerkApiUser {
  id: string;
  external_id: string | null;
  primary_email_address_id: string | null;
  email_addresses: {
    id: string;
    email_address: string;
    verification: { status: string } | null;
  }[];
}

async function api(path: string, init: RequestInit = {}): Promise<{ status: number; body: unknown }> {
  const key = process.env.CLERK_SECRET_KEY;
  if (!key) throw new Error("CLERK_SECRET_KEY is not set");
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

function toUser(u: ClerkApiUser): ClerkUser {
  const primary =
    u.email_addresses.find((e) => e.id === u.primary_email_address_id) ||
    u.email_addresses[0] ||
    null;
  return {
    id: u.id,
    external_id: u.external_id,
    email: primary?.email_address ?? null,
    emailAddressId: primary?.id ?? null,
    emailVerified: primary?.verification?.status === "verified",
  };
}

export async function findUserByEmail(email: string): Promise<ClerkUser | null> {
  const { status, body } = await api(`/users?email_address=${encodeURIComponent(email)}`);
  if (status !== 200 || !Array.isArray(body) || body.length === 0) return null;
  return toUser(body[0] as ClerkApiUser);
}

/* Lookup by the local auth.users uuid (stored in Clerk as external_id). */
export async function findUserByExternalId(externalId: string): Promise<ClerkUser | null> {
  const { status, body } = await api(`/users?external_id=${encodeURIComponent(externalId)}`);
  if (status !== 200 || !Array.isArray(body) || body.length === 0) return null;
  return toUser(body[0] as ClerkApiUser);
}

/* True only when the password matches. Clerk 422s on a wrong password and
   404s on unknown user ids -- both are just "no". */
export async function verifyPassword(clerkUserId: string, password: string): Promise<boolean> {
  const { status, body } = await api(`/users/${clerkUserId}/verify_password`, {
    method: "POST",
    body: JSON.stringify({ password }),
  });
  return status === 200 && (body as { verified?: boolean }).verified === true;
}

export async function createUser(
  email: string,
  password: string,
  externalId: string,
): Promise<{ user: ClerkUser | null; emailTaken: boolean; error: string | null }> {
  const { status, body } = await api("/users", {
    method: "POST",
    body: JSON.stringify({ email_address: [email], password, external_id: externalId }),
  });
  if (status === 200 || status === 201) {
    return { user: toUser(body as ClerkApiUser), emailTaken: false, error: null };
  }
  const errors = (body as { errors?: { code?: string; message?: string }[] }).errors || [];
  const emailTaken = errors.some(
    (e) => e.code === "form_identifier_exists" || e.code === "email_address_exists",
  );
  return { user: null, emailTaken, error: errors[0]?.message || `clerk ${status}` };
}

export async function setPassword(clerkUserId: string, password: string): Promise<boolean> {
  const { status } = await api(`/users/${clerkUserId}`, {
    method: "PATCH",
    body: JSON.stringify({ password, skip_password_checks: true }),
  });
  return status === 200;
}

export async function deleteUser(clerkUserId: string): Promise<boolean> {
  const { status } = await api(`/users/${clerkUserId}`, { method: "DELETE" });
  return status === 200 || status === 404;
}

/* Email + password -> the identity the app keys on, or why not.
   "invalid" covers unknown email and wrong password alike (callers return
   one generic error either way); "unverified" lets login surface the
   confirm-your-email case distinctly, matching the old Supabase behavior.

   The confirmation bit lives in auth.users.email_confirmed_at, NOT Clerk:
   Clerk auto-verifies Backend-API-created addresses and its instance
   invariant refuses to un-verify a user's only email, so it can't carry
   this state. The verify-email route stamps the column. */
export async function authenticate(
  email: string,
  password: string,
): Promise<
  | { ok: true; localId: string; clerkId: string; email: string }
  | { ok: false; reason: "invalid" | "unverified" }
> {
  const user = await findUserByEmail(email);
  if (!user || !user.external_id || !user.email) return { ok: false, reason: "invalid" };
  const verified = await verifyPassword(user.id, password);
  if (!verified) return { ok: false, reason: "invalid" };

  const { createAdminClient } = await import("@/lib/supabase-server");
  const admin = createAdminClient();
  const { data: confirmed } = await admin.rpc("auth_user_confirmed", { p_id: user.external_id });
  if (confirmed !== true) return { ok: false, reason: "unverified" };

  return { ok: true, localId: user.external_id, clerkId: user.id, email: user.email };
}

export async function markEmailVerified(emailAddressId: string): Promise<boolean> {
  const { status } = await api(`/email_addresses/${emailAddressId}`, {
    method: "PATCH",
    body: JSON.stringify({ verified: true }),
  });
  return status === 200;
}

/* Replace the user's email: add the new address verified+primary, then drop
   the old one. Runs only after the emailed confirmation link is clicked, so
   verification already happened on our side. */
export async function replaceEmail(clerkUserId: string, newEmail: string): Promise<boolean> {
  const { status: uStatus, body: uBody } = await api(`/users/${clerkUserId}`);
  if (uStatus !== 200) return false;
  const before = toUser(uBody as ClerkApiUser);

  const { status: cStatus, body: cBody } = await api("/email_addresses", {
    method: "POST",
    body: JSON.stringify({
      user_id: clerkUserId,
      email_address: newEmail,
      verified: true,
      primary: true,
    }),
  });
  if (cStatus !== 200 && cStatus !== 201) return false;
  void cBody;

  if (before.emailAddressId) {
    await api(`/email_addresses/${before.emailAddressId}`, { method: "DELETE" });
  }
  return true;
}
