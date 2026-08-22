import { cookies } from "next/headers";
import { ACCESS_COOKIE, REFRESH_COOKIE, revokeSession } from "@/lib/session";

/* Logout. The POST half of the old Supabase version (storing tokens the
   browser SDK minted) went away with the 2026-08-22 Clerk migration --
   sessions are minted server-side now, so nothing legitimate posts here. */

export async function DELETE() {
  const cookieStore = await cookies();
  const refresh = cookieStore.get(REFRESH_COOKIE)?.value;
  if (refresh) {
    try {
      await revokeSession(refresh);
    } catch {
      // Cookie cleanup still proceeds.
    }
  }
  cookieStore.delete(ACCESS_COOKIE);
  cookieStore.delete(REFRESH_COOKIE);
  return Response.json({ ok: true });
}
