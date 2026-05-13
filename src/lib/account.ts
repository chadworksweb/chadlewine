import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase-server";

/* Server-side helpers for customer account routes.
   /account pages call getCurrentSession() to resolve the cookie session
   into an audience row; if no session, the page redirects to /account/login. */

export interface CurrentSession {
  userId: string;
  email: string;
  audienceId: string;
}

export async function getCurrentSession(): Promise<CurrentSession | null> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("sb-access-token")?.value;
  if (!accessToken) return null;

  try {
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const { data, error } = await anon.auth.getUser(accessToken);
    if (error || !data?.user?.email) return null;

    const admin = createAdminClient();
    const { data: row } = await admin
      .from("audience")
      .select("id")
      .eq("user_id", data.user.id)
      .maybeSingle();
    if (!row) {
      // Trigger should have created this row on signup. If it's missing
      // (e.g. seed user predates the trigger), fall back to creating it now.
      const { data: created } = await admin
        .from("audience")
        .insert({
          email: data.user.email.toLowerCase(),
          user_id: data.user.id,
          marketing_opt_in_source: "account",
        })
        .select("id")
        .single();
      if (!created) return null;
      return {
        userId: data.user.id,
        email: data.user.email,
        audienceId: created.id,
      };
    }
    return {
      userId: data.user.id,
      email: data.user.email,
      audienceId: row.id,
    };
  } catch {
    return null;
  }
}
