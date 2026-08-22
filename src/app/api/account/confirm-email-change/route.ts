import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { findUserByExternalId, replaceEmail } from "@/lib/clerk-backend";
import { consumeActionToken, revokeAllSessions } from "@/lib/session";

/* Applies an email change once the confirmation link sent to the NEW
   address is clicked: Clerk gets the new address (verified + primary),
   auth.users and audience follow, and every session is revoked so stale
   access tokens carrying the old email die with it. */

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || "";
  const origin = process.env.NEXT_PUBLIC_SITE_URL || url.origin;

  const row = token ? await consumeActionToken("email_change", token) : null;
  const newEmail = typeof row?.payload?.new_email === "string" ? row.payload.new_email : null;
  if (!row || !row.user_id || !newEmail) {
    return NextResponse.redirect(`${origin}/account?email_change_expired=1`);
  }

  const user = await findUserByExternalId(row.user_id);
  if (!user) {
    return NextResponse.redirect(`${origin}/account?email_change_expired=1`);
  }

  const ok = await replaceEmail(user.id, newEmail);
  if (!ok) {
    return NextResponse.redirect(`${origin}/account?email_change_failed=1`);
  }

  const admin = createAdminClient();
  await admin.rpc("auth_user_update_email", { p_id: row.user_id, p_email: newEmail });
  await admin
    .from("audience")
    .update({ email: newEmail, updated_at: new Date().toISOString() })
    .eq("user_id", row.user_id);

  // Old sessions carry the old email in their claims — end them.
  await revokeAllSessions(row.user_id);

  return NextResponse.redirect(`${origin}/account/login?email_changed=1`);
}
