import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase-server";
import { ACCESS_COOKIE, verifyAccessToken } from "@/lib/session";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ACCESS_COOKIE)?.value;
  if (!token) return Response.json({ user: null });

  const claims = await verifyAccessToken(token);
  if (!claims) return Response.json({ user: null });

  // Surface admin status so the public login flow can reject admin users
  // and force them through the secret admin URL instead.
  let isAdmin = false;
  try {
    const admin = createAdminClient();
    const { data: adminRow } = await admin
      .from("admins")
      .select("user_id")
      .eq("user_id", claims.sub)
      .maybeSingle();
    isAdmin = !!adminRow;
  } catch {
    // Non-fatal — if admin check fails, treat as customer.
  }

  return Response.json({
    user: { id: claims.sub, email: claims.email, is_admin: isAdmin },
  });
}
