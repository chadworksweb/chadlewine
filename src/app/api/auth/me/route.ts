import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get("sb-access-token")?.value;
  if (!token) return Response.json({ user: null });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return Response.json({ user: null });

  // Surface admin status so the public login flow can reject admin users
  // and force them through the secret admin URL instead. Uses service-role
  // since admins-table RLS would block the user from reading their own row.
  let isAdmin = false;
  try {
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const { data: adminRow } = await adminClient
      .from("admins")
      .select("user_id")
      .eq("user_id", data.user.id)
      .maybeSingle();
    isAdmin = !!adminRow;
  } catch {
    // Non-fatal — if admin check fails, treat as customer.
  }

  return Response.json({
    user: { id: data.user.id, email: data.user.email, is_admin: isAdmin },
  });
}
