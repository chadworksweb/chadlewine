import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase-server";

/* Returns the caller's currently applicable member coupon (unredeemed,
   unexpired) if any. Cart drawer hits this on open to decide whether
   to render the "Apply your 20% coupon" toggle. */
export async function GET() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("sb-access-token")?.value;
  if (!accessToken) return Response.json({ coupon: null });

  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
  const { data: userResp } = await userClient.auth.getUser(accessToken);
  const userId = userResp?.user?.id;
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
