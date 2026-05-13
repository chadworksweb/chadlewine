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

  const supabase = createAdminClient();
  const [aRes, ordersRes] = await Promise.all([
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
  ]);

  if (!aRes.data) redirect("/account/login");

  const data: AccountData = {
    audience: aRes.data,
    orders: (ordersRes.data || []) as AccountData["orders"],
    hasStripeCustomer: !!aRes.data.stripe_customer_id,
  };

  return <AccountDashboard initial={data} />;
}
