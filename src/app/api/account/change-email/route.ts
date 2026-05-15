import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase-server";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const newEmail = typeof body.new_email === "string" ? body.new_email.trim().toLowerCase() : "";

  if (!EMAIL_RE.test(newEmail)) {
    return Response.json({ error: "Valid email required." }, { status: 400 });
  }

  const cookieStore = await cookies();
  const accessToken = cookieStore.get("sb-access-token")?.value;
  const refreshToken = cookieStore.get("sb-refresh-token")?.value;
  if (!accessToken || !refreshToken) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }

  // Block if the new email already belongs to another auth user. Supabase's
  // updateUser would reject this anyway, but we want a clean error first.
  const admin = createAdminClient();
  const { data: usersList } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const collision = usersList?.users.find((u) => u.email?.toLowerCase() === newEmail);
  if (collision) {
    return Response.json(
      { error: "That email is already associated with another account." },
      { status: 409 },
    );
  }

  // Use the caller's session to trigger Supabase's secure-email-change flow.
  // Supabase sends a confirmation to the NEW address (and, when "Secure email
  // change" is enabled in project settings, to the old one too). Only after
  // the user clicks the link does auth.users.email actually update — which
  // fires the on_auth_user_email_changed trigger to sync public.audience.
  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
  const { error: sessionErr } = await userClient.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (sessionErr) {
    return Response.json({ error: "Session expired. Sign in again." }, { status: 401 });
  }

  const origin = request.headers.get("origin") || process.env.NEXT_PUBLIC_SITE_URL || "https://chadlewine.com";
  const { error } = await userClient.auth.updateUser(
    { email: newEmail },
    { emailRedirectTo: `${origin}/account?email_changed=1` },
  );

  if (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }

  return Response.json({
    ok: true,
    message: "Confirmation sent to your new email. Click the link there to finish the change.",
  });
}
