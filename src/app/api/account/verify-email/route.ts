import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { findUserByEmail, markEmailVerified } from "@/lib/clerk-backend";
import { consumeActionToken } from "@/lib/session";

/* Signup email confirmation. The register route emails a single-use token
   pointing here; a valid click marks the email verified in Clerk (login
   requires it) and stamps auth.users, then lands on the login form with
   the flag its "Thanks for confirming" banner reads. */

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || "";
  const origin = process.env.NEXT_PUBLIC_SITE_URL || url.origin;

  const row = token ? await consumeActionToken("email_verify", token) : null;
  if (!row) {
    return NextResponse.redirect(`${origin}/account/login?confirm_expired=1`);
  }

  const user = await findUserByEmail(row.email);
  if (user?.emailAddressId) {
    await markEmailVerified(user.emailAddressId);
  }
  if (row.user_id) {
    const admin = createAdminClient();
    await admin.rpc("auth_user_confirm_email", { p_id: row.user_id });
  }

  return NextResponse.redirect(`${origin}/account/login?confirmed=1`);
}
