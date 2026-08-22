import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase-server";
import { createUser } from "@/lib/clerk-backend";
import { createActionToken } from "@/lib/session";
import { sendEmail, buildConfirmAccountEmailHtml } from "@/lib/email";
import { checkRateLimit } from "@/lib/rate-limit";
import { recordAttempt, clientIp, clientUA } from "@/lib/auth-attempt";
import { verifyTurnstile } from "@/lib/turnstile";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 12;

// Generic response shape — same for success, for "email exists", and for
// honeypot-trapped bots. Prevents account-enumeration.
const GENERIC_OK_RESPONSE = {
  ok: true,
  message: "Check your email to confirm your account.",
};

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const turnstileToken =
    typeof body.turnstile_token === "string" ? body.turnstile_token : null;
  const honeypot = typeof body.honeypot === "string" ? body.honeypot : "";
  const tosAccepted = body.tos_accepted === true;

  const ip = clientIp(request);
  const ua = clientUA(request);

  // Honeypot — any value here means a bot filled an invisible field.
  // Return the same generic success response so the bot moves on.
  if (honeypot) {
    await recordAttempt({ email, ip, user_agent: ua, action: "register", success: false, reason: "honeypot" });
    return Response.json(GENERIC_OK_RESPONSE);
  }

  if (!EMAIL_RE.test(email)) {
    return Response.json({ error: "Valid email required." }, { status: 400 });
  }
  if (password.length < MIN_PASSWORD) {
    return Response.json(
      { error: `Password must be at least ${MIN_PASSWORD} characters.` },
      { status: 400 }
    );
  }
  if (!tosAccepted) {
    return Response.json(
      { error: "You must agree to the Terms of Service to create an account." },
      { status: 400 }
    );
  }

  // Per-IP register cap.
  const rl = await checkRateLimit({ email, ip, action: "register" });
  if (!rl.allowed) {
    await recordAttempt({ email, ip, user_agent: ua, action: "register", success: false, reason: rl.reason });
    return Response.json(
      { error: "Too many signup attempts. Try again later.", retryAfter: rl.retryAfter },
      { status: 429, headers: rl.retryAfter ? { "Retry-After": String(rl.retryAfter) } : {} }
    );
  }

  // Turnstile (no-op if not configured).
  const tsOk = await verifyTurnstile(turnstileToken, ip);
  if (!tsOk) {
    await recordAttempt({ email, ip, user_agent: ua, action: "register", success: false, reason: "turnstile_failed" });
    return Response.json({ error: "Bot check failed. Refresh and try again." }, { status: 400 });
  }

  // Determine the public origin for the email confirmation link. Trust
  // the request's Origin header (set per env by the browser).
  const origin = request.headers.get("origin") || process.env.NEXT_PUBLIC_SITE_URL || "https://chadlewine.com";

  // Create the user in Clerk (the user directory + password verifier since
  // the Supabase exit). The local uuid the app keys on is minted here and
  // stored in Clerk as external_id.
  const localId = randomUUID();
  const created = await createUser(email, password, localId);

  if (!created.user) {
    // If the email exists but was never confirmed, this is almost always
    // the same person whose first link expired: send a fresh confirmation.
    // Either way the response stays generic so nothing about the email's
    // existence leaks.
    if (created.emailTaken) {
      try {
        const { findUserByEmail } = await import("@/lib/clerk-backend");
        const existing = await findUserByEmail(email);
        if (existing && !existing.emailVerified && existing.external_id) {
          const token = await createActionToken("email_verify", email, existing.external_id, 60 * 60 * 24);
          await sendEmail({
            to: email,
            subject: "Confirm your chadlewine.com account",
            html: buildConfirmAccountEmailHtml({
              confirmUrl: `${origin}/api/account/verify-email?token=${token}`,
            }),
          });
        }
      } catch (e) {
        console.error("[register] reconfirm email failed:", e);
      }
    }
    await recordAttempt({
      email, ip, user_agent: ua, action: "register", success: false,
      reason: created.emailTaken ? "email_exists" : created.error || "clerk_error",
    });
    return Response.json(GENERIC_OK_RESPONSE);
  }

  const admin = createAdminClient();

  // The identity row (was the Supabase signup trigger's job).
  const { error: authRowErr } = await admin.rpc("auth_user_insert", { p_id: localId, p_email: email });
  if (authRowErr) console.error("[register] auth_user_insert failed:", authRowErr.message);

  // Attach or create the audience row: a guest buyer with this email claims
  // their history; a brand-new email gets a fresh row.
  const { data: existingAud } = await admin
    .from("audience")
    .select("id, user_id")
    .eq("email", email)
    .maybeSingle();
  if (existingAud && !existingAud.user_id) {
    await admin.from("audience").update({ user_id: localId }).eq("id", existingAud.id);
  } else if (!existingAud) {
    await admin.from("audience").insert({ email, user_id: localId, marketing_opt_in_source: "account" });
  }

  // Confirmation email — our own token flow now (Resend), landing on the
  // login form with a flag so it can show the "Thanks for confirming" banner.
  try {
    const token = await createActionToken("email_verify", email, localId, 60 * 60 * 24);
    await sendEmail({
      to: email,
      subject: "Confirm your chadlewine.com account",
      html: buildConfirmAccountEmailHtml({
        confirmUrl: `${origin}/api/account/verify-email?token=${token}`,
      }),
    });
  } catch (e) {
    console.error("[register] confirmation email failed:", e);
  }

  // Auto-subscribe to marketing campaigns + record TOS acceptance on the
  // audience row: flips subscriber_status and timestamps the consent
  // moments. Disclosure copy on the register form is the consent record.
  // Notify admin so we know about every new signup.
  {
    try {
      const now = new Date().toISOString();
      const { data: updated } = await admin
        .from("audience")
        .update({
          subscriber_status: "active",
          marketing_opt_in_at: now,
          marketing_opt_in_source: "account",
          tos_accepted_at: now,
          updated_at: now,
        })
        .eq("user_id", localId)
        .select("id, email, display_name, lifetime_orders, lifetime_spend")
        .single();

      if (updated) {
        const { notifyNewMember, notifyTierChange } = await import("@/lib/audience-notify");
        // Tier on a fresh account: subscriber+account (or customer+account
        // if they previously bought as guest with this email).
        const tier =
          updated.lifetime_orders >= 2
            ? "repeat-customer"
            : updated.lifetime_orders >= 1
              ? "customer+account"
              : "subscriber+account";
        const isFresh = updated.lifetime_orders === 0;
        const ctx = {
          audience_id: updated.id,
          email: updated.email,
          display_name: updated.display_name,
          tier: tier as "subscriber+account" | "customer+account" | "repeat-customer",
          source: "account registration",
          lifetime_orders: updated.lifetime_orders,
          lifetime_spend: updated.lifetime_spend,
        };
        if (isFresh) {
          void notifyNewMember(ctx);
        } else {
          // Email matched an existing guest-buyer record. They claimed
          // it by registering — surface as a tier change.
          void notifyTierChange(ctx, "customer");
        }
      }
    } catch (e) {
      // Non-fatal — account is created, audience link will catch up.
      console.error("[register] audience subscribe update failed:", e);
    }
  }

  await recordAttempt({ email, ip, user_agent: ua, action: "register", success: true });
  return Response.json(GENERIC_OK_RESPONSE);
}
