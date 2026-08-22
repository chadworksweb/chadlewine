import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase-server";
import { ACCESS_COOKIE, verifyAccessToken } from "@/lib/session";
import { sendEmail, buildMemberCouponEmailHtml } from "@/lib/email";

const SOURCE = "cart_thankyou_offer";
const PERCENT_OFF = 20;
const DAYS_VALID = 7;

// 8-char uppercase alphanumeric, Stripe Promotion Code style. Used as the
// human display label only — the actual discount is computed and applied
// inside our cart at checkout time, not by typing this code into Stripe.
function generateMemberCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const sessionId = typeof body.session_id === "string" ? body.session_id : "";
  if (!sessionId) {
    return Response.json({ error: "session_id required" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_COOKIE)?.value;
  if (!accessToken) {
    return Response.json({ error: "Sign in required to claim." }, { status: 401 });
  }

  const claims = await verifyAccessToken(accessToken);
  const userId = claims?.sub;
  if (!userId) {
    return Response.json({ error: "Sign in required to claim." }, { status: 401 });
  }

  const admin = createAdminClient();

  // Order must exist and be tied to an audience row owned by the caller.
  // This stops one member from grabbing another buyer's offer.
  const { data: order } = await admin
    .from("orders")
    .select("id, audience_id")
    .eq("stripe_session_id", sessionId)
    .maybeSingle();
  if (!order || !order.audience_id) {
    return Response.json({ error: "Order not found." }, { status: 404 });
  }

  const { data: audience } = await admin
    .from("audience")
    .select("id, email, user_id")
    .eq("id", order.audience_id)
    .maybeSingle();
  if (!audience || audience.user_id !== userId) {
    return Response.json({ error: "This order isn't on your account." }, { status: 403 });
  }

  // Hard once-per-member-per-source check.
  const { data: existing } = await admin
    .from("member_coupons")
    .select("id")
    .eq("audience_id", audience.id)
    .eq("source", SOURCE)
    .maybeSingle();
  if (existing) {
    return Response.json({ error: "You've already claimed this offer." }, { status: 409 });
  }

  // Stripe artifacts are NOT created here. The coupon's discount logic
  // ("20% off all music in cart, or 20% off most-expensive merch line —
  // whichever is larger") is dynamic per cart, so the actual Stripe Coupon
  // is generated ad-hoc inside cart-checkout when the buyer toggles the
  // coupon on. This row is the durable claim record; the `code` is a
  // display label, not something the buyer types anywhere.
  const expiresAt = new Date(Date.now() + DAYS_VALID * 24 * 60 * 60 * 1000);

  // Generate a code, retry on the off-chance of collision against the
  // unique index. 32^8 keyspace, retries are functionally never needed.
  let code = generateMemberCode();
  let inserted: { code: string; percent_off: number; granted_at: string; expires_at: string } | null = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data, error } = await admin
      .from("member_coupons")
      .insert({
        audience_id: audience.id,
        source: SOURCE,
        code,
        percent_off: PERCENT_OFF,
        expires_at: expiresAt.toISOString(),
      })
      .select("code, percent_off, granted_at, expires_at")
      .single();
    if (data) {
      inserted = data;
      break;
    }
    if (error && /duplicate.*code|unique.*code/i.test(error.message)) {
      code = generateMemberCode();
      continue;
    }
    return Response.json({ error: error?.message || "insert failed" }, { status: 500 });
  }
  if (!inserted) {
    return Response.json({ error: "Could not allocate a code." }, { status: 500 });
  }

  // Fire the receipt email; ignore failure (the code is still saved on the
  // account dashboard and visible on the thank-you page).
  try {
    await sendEmail({
      to: audience.email,
      subject: `Your ${PERCENT_OFF}% off coupon is ready`,
      html: buildMemberCouponEmailHtml({
        code: inserted.code,
        percentOff: PERCENT_OFF,
        expiresAt,
      }),
    });
  } catch (e) {
    console.error("[member-coupons/claim] email send failed", e);
  }

  try {
    await admin.from("audience_events").insert({
      audience_id: audience.id,
      event_type: "coupon_claimed",
      metadata: {
        source: SOURCE,
        code: inserted.code,
        percent_off: PERCENT_OFF,
        expires_at: expiresAt.toISOString(),
      },
    });
  } catch {
    // Non-fatal.
  }

  return Response.json({ ok: true, coupon: inserted });
}
