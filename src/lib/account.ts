import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase-server";
import { ACCESS_COOKIE, verifyAccessToken } from "@/lib/session";

/* Server-side helpers for customer account routes.
   /account pages call getCurrentSession() to resolve the cookie session
   into an audience row; if no session, the page redirects to /account/login.

   Since the 2026-08-22 Clerk migration the access token is the app's own
   HMAC JWT (see session.ts), so resolving it is a local verify -- no
   network call. sub = auth.users.id, the uuid audience/admins key on. */

export interface CurrentSession {
  userId: string;
  email: string;
  audienceId: string;
  isAdmin: boolean;
}

export async function getCurrentSession(): Promise<CurrentSession | null> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_COOKIE)?.value;
  if (!accessToken) return null;

  try {
    const claims = await verifyAccessToken(accessToken);
    if (!claims?.sub || !claims.email) return null;

    const admin = createAdminClient();
    const [audRes, adminRes] = await Promise.all([
      admin.from("audience").select("id").eq("user_id", claims.sub).maybeSingle(),
      admin.from("admins").select("user_id").eq("user_id", claims.sub).maybeSingle(),
    ]);
    const isAdmin = !!adminRes.data;

    if (!audRes.data) {
      // The register route creates this row on signup. If it's missing
      // (e.g. a user that predates the trigger era), create it now.
      const { data: created } = await admin
        .from("audience")
        .insert({
          email: claims.email.toLowerCase(),
          user_id: claims.sub,
          marketing_opt_in_source: "account",
        })
        .select("id")
        .single();
      if (!created) return null;
      return {
        userId: claims.sub,
        email: claims.email,
        audienceId: created.id,
        isAdmin,
      };
    }
    return {
      userId: claims.sub,
      email: claims.email,
      audienceId: audRes.data.id,
      isAdmin,
    };
  } catch {
    return null;
  }
}
