import { createAdminClient } from "@/lib/supabase-server";
import { deleteUser, findUserByExternalId } from "@/lib/clerk-backend";
import { revokeAllSessions } from "@/lib/session";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// DELETE /api/admin/audience/[id]/delete-account
//
// Removes the account (Clerk user + auth.users row) linked to this audience
// contact. The audience row itself stays — only its account link is severed
// (ON DELETE SET NULL). After this, the customer can register again with the
// same email and reclaim the row. Useful for test cleanup and for
// force-removing problem accounts. Every session dies with the account.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return Response.json({ error: "Invalid id" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: row } = await supabase
    .from("audience")
    .select("user_id, email")
    .eq("id", id)
    .maybeSingle();

  if (!row) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  if (!row.user_id) {
    return Response.json(
      { error: "No account linked to this contact." },
      { status: 400 }
    );
  }

  const clerkUser = await findUserByExternalId(row.user_id);
  if (clerkUser) {
    const ok = await deleteUser(clerkUser.id);
    if (!ok) {
      return Response.json({ error: "Clerk user delete failed" }, { status: 500 });
    }
  }
  await revokeAllSessions(row.user_id);
  const { error } = await supabase.rpc("auth_user_delete", { p_id: row.user_id });
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  // Belt-and-suspenders: clear the user_id on the audience row in case the
  // ON DELETE SET NULL didn't fire.
  await supabase
    .from("audience")
    .update({ user_id: null, updated_at: new Date().toISOString() })
    .eq("id", id);

  await supabase.rpc("upsert_audience_event", {
    p_audience_id: id,
    p_event_type: "account_deleted",
    p_metadata: { email: row.email },
  });

  return Response.json({ ok: true });
}
