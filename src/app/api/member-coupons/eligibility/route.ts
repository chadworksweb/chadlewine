import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase-server";
import { ACCESS_COOKIE, REFRESH_COOKIE, verifyAccessToken } from "@/lib/session";

/* Decides whether the caller can claim the cart-thank-you coupon on the
   order identified by Stripe session_id. Returns one of:
   - { status: "claimable", expires_in_days: 7 }
   - { status: "guest" }                — order belongs to a guest audience row
   - { status: "must_sign_in" }         — audience has a user, caller isn't them
   - { status: "already_claimed", coupon: {...} }
   - { status: "not_eligible" }         — anything else (no order, etc.)
*/
export async function GET(request: Request) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id");
  if (!sessionId) {
    return Response.json({ status: "not_eligible" });
  }

  const admin = createAdminClient();

  const { data: order } = await admin
    .from("orders")
    .select("id, audience_id, buyer_email")
    .eq("stripe_session_id", sessionId)
    .maybeSingle();
  if (!order || !order.audience_id) {
    return Response.json({ status: "not_eligible" });
  }

  const { data: audience } = await admin
    .from("audience")
    .select("id, user_id")
    .eq("id", order.audience_id)
    .maybeSingle();
  if (!audience) {
    return Response.json({ status: "not_eligible" });
  }

  // Already claimed? Surface the existing coupon (read-only).
  const { data: existing } = await admin
    .from("member_coupons")
    .select("code, percent_off, granted_at, expires_at, redeemed_at")
    .eq("audience_id", audience.id)
    .eq("source", "cart_thankyou_offer")
    .maybeSingle();
  if (existing) {
    return Response.json({ status: "already_claimed", coupon: existing });
  }

  // Guest order (no account attached to the audience row).
  if (!audience.user_id) {
    return Response.json({ status: "guest" });
  }

  // Account-attached order — caller must be that user to claim.
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_COOKIE)?.value;
  const refreshToken = cookieStore.get(REFRESH_COOKIE)?.value;
  if (!accessToken || !refreshToken) {
    return Response.json({ status: "must_sign_in" });
  }

  const claims = await verifyAccessToken(accessToken);
  const callerId = claims?.sub;
  if (!callerId || callerId !== audience.user_id) {
    return Response.json({ status: "must_sign_in" });
  }

  return Response.json({ status: "claimable", expires_in_days: 7 });
}
