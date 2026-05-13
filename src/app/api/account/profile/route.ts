import { getCurrentSession } from "@/lib/account";
import { setDisplayName, setMailingAddress, setNames } from "@/lib/audience";
import { createAdminClient } from "@/lib/supabase-server";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("audience")
    .select("*")
    .eq("id", session.audienceId)
    .single();
  return Response.json(data);
}

export async function PATCH(request: Request) {
  const session = await getCurrentSession();
  if (!session) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));

  if (
    typeof body.first_name === "string" ||
    typeof body.last_name === "string"
  ) {
    await setNames(session.audienceId, {
      first_name: typeof body.first_name === "string" ? body.first_name : undefined,
      last_name: typeof body.last_name === "string" ? body.last_name : undefined,
    });
  } else if (typeof body.display_name === "string") {
    // Backwards-compat for older clients still sending display_name.
    await setDisplayName(session.audienceId, body.display_name);
  }
  if (body.mailing_address && typeof body.mailing_address === "object") {
    await setMailingAddress(session.audienceId, body.mailing_address);
  }
  return Response.json({ ok: true });
}
