import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase-server";
import { ACCESS_COOKIE, verifyAccessToken } from "@/lib/session";

/* Returns the caller's currently applicable member coupon (unredeemed,
   unexpired) if any. Cart drawer hits this on open to decide whether
   to render the "Apply your 20% coupon" toggle. */
export async function GET() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_COOKIE)?.value;
  if (!accessToken) return Response.json({ coupon: null });

  const claims = await verifyAccessToken(accessToken);
  const userId = claims?.sub;
  if (!userId) return Response.json({ coupon: null });

  const admin = createAdminClient();
  const { data: audience } = await admin
    .from("audience")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!audience) return Response.json({ coupon: null });

  const { data: coupon } = await admin
    .from("member_coupons")
    .select("id, code, percent_off, expires_at, source")
    .eq("audience_id", audience.id)
    .is("redeemed_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("granted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return Response.json({ coupon: coupon || null });
}
