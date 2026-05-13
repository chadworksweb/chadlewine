import { getCurrentSession } from "@/lib/account";
import { setDisplayName, setMailingAddress } from "@/lib/audience";
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

  if (typeof body.display_name === "string") {
    await setDisplayName(session.audienceId, body.display_name);
  }
  if (body.mailing_address && typeof body.mailing_address === "object") {
    await setMailingAddress(session.audienceId, body.mailing_address);
  }
  return Response.json({ ok: true });
}
