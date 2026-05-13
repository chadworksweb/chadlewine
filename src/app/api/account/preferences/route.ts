import { getCurrentSession } from "@/lib/account";
import { setSubscriberStatus } from "@/lib/audience";

export async function PATCH(request: Request) {
  const session = await getCurrentSession();
  if (!session) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  if (body.subscriber_status !== "active" && body.subscriber_status !== "unsubscribed") {
    return Response.json({ error: "Invalid status" }, { status: 400 });
  }
  await setSubscriberStatus(session.audienceId, body.subscriber_status);
  return Response.json({ ok: true });
}
