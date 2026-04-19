import { createAdminClient } from "@/lib/supabase-server";
import { sendEmail, buildRecoveryEmailHtml } from "@/lib/email";

const SITE_URL = "https://chadlewine.com";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function generateToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function POST(request: Request) {
  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: true });
  }

  const email = (body.email || "").trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    // Always return ok to prevent enumeration
    return Response.json({ ok: true });
  }

  const supabase = createAdminClient();

  // Any purchases under this email? Case-insensitive match.
  const { data: purchases } = await supabase
    .from("purchases")
    .select("id")
    .ilike("buyer_email", email)
    .limit(1);

  if (!purchases || purchases.length === 0) {
    // Silent success
    return Response.json({ ok: true });
  }

  const token = generateToken();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  const { error } = await supabase.from("recovery_tokens").insert({
    email,
    token,
    expires_at: expiresAt,
  });

  if (error) {
    console.error("[recover/request] insert failed:", error.message);
    return Response.json({ ok: true });
  }

  const verifyUrl = `${SITE_URL}/music/recover/view?token=${token}`;
  await sendEmail({
    to: email,
    subject: "Recover your downloads — chadlewine.com",
    html: buildRecoveryEmailHtml({ verifyUrl }),
  });

  return Response.json({ ok: true });
}
