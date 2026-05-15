import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase-server";
import { AccountAuthForm } from "@/components/AccountAuthForm";

export const metadata: Metadata = {
  title: "Claim your account - Chad Lewine",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface SearchParams {
  token?: string;
}

async function resolveEmailFromToken(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("audience")
    .select("email")
    .eq("unsubscribe_token", token)
    .maybeSingle();
  return data?.email ?? null;
}

export default async function ClaimPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { token } = await searchParams;
  const email = await resolveEmailFromToken(token);

  if (!email) {
    return (
      <div className="account-auth">
        <div className="account-auth__card">
          <h1 className="account-auth__title">Bad or expired link</h1>
          <p className="account-auth__sub">
            That claim link doesn&rsquo;t match a contact. Try the regular
            register flow instead.
          </p>
          <div className="account-auth__footer">
            <a href="/account/register">Create an account →</a>
          </div>
        </div>
      </div>
    );
  }

  return <AccountAuthForm mode="claim" initialEmail={email} />;
}
