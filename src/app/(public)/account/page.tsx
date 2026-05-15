import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase-server";
import { getCurrentSession } from "@/lib/account";
import { AccountDashboard, type AccountData } from "@/components/AccountDashboard";

export const metadata: Metadata = {
  title: "Your Account - Chad Lewine",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/account/login");
  // Admins shouldn't see the customer dashboard. Bounce them out — the
  // public login already rejects them, but defense-in-depth in case
  // they have a cookie from a prior session.
  if (session.isAdmin) redirect("/admin");

  const supabase = createAdminClient();
  const [aRes, ordersRes, couponsRes] = await Promise.all([
    supabase
      .from("audience")
      .select("*, stripe_customer_id")
      .eq("id", session.audienceId)
      .single(),
    supabase
      .from("orders")
      .select("id, order_number, status, total, created_at")
      .eq("audience_id", session.audienceId)
      .order("created_at", { ascending: false }),
    supabase
      .from("member_coupons")
      .select("code, percent_off, source, granted_at, expires_at, redeemed_at")
      .eq("audience_id", session.audienceId)
      .order("granted_at", { ascending: false }),
  ]);

  if (!aRes.data) redirect("/account/login");

  const data: AccountData = {
    audience: aRes.data,
    orders: (ordersRes.data || []) as AccountData["orders"],
    hasStripeCustomer: !!aRes.data.stripe_customer_id,
    coupons: (couponsRes.data || []) as AccountData["coupons"],
  };

  return <AccountDashboard initial={data} />;
}
