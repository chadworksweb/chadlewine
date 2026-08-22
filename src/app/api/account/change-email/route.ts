import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase-server";
import { findUserByEmail } from "@/lib/clerk-backend";
import { ACCESS_COOKIE, createActionToken, verifyAccessToken } from "@/lib/session";
import { sendEmail, buildEmailChangeEmailHtml } from "@/lib/email";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* Secure email change, our own flow since the Supabase exit: a single-use
   token goes to the NEW address, and nothing changes until it's clicked
   (see confirm-email-change). The signed-in session identifies the account;
   the click proves control of the new inbox. */

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const newEmail = typeof body.new_email === "string" ? body.new_email.trim().toLowerCase() : "";

  if (!EMAIL_RE.test(newEmail)) {
    return Response.json({ error: "Valid email required." }, { status: 400 });
  }

  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_COOKIE)?.value;
  const claims = accessToken ? await verifyAccessToken(accessToken) : null;
  if (!claims) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }

  // Block if the new email already belongs to another account.
  const collision = await findUserByEmail(newEmail);
  if (collision) {
    return Response.json(
      { error: "That email is already associated with another account." },
      { status: 409 },
    );
  }

  const origin = request.headers.get("origin") || process.env.NEXT_PUBLIC_SITE_URL || "https://chadlewine.com";
  const token = await createActionToken("email_change", claims.email, claims.sub, 60 * 30, {
    new_email: newEmail,
  });
  const sent = await sendEmail({
    to: newEmail,
    subject: "Confirm your new email for chadlewine.com",
    html: buildEmailChangeEmailHtml({
      confirmUrl: `${origin}/api/account/confirm-email-change?token=${token}`,
      newEmail,
    }),
  });
  if (!sent) {
    return Response.json({ error: "Could not send the confirmation email. Try again." }, { status: 500 });
  }

  // Touch the audience row so the request is visible in admin history.
  const admin = createAdminClient();
  await admin
    .from("audience")
    .update({ updated_at: new Date().toISOString() })
    .eq("user_id", claims.sub);

  return Response.json({
    ok: true,
    message: "Confirmation sent to your new email. Click the link there to finish the change.",
  });
}
