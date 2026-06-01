import { getCurrentSession } from "@/lib/account";
import { setSubscriberStatus, setNotificationPrefs } from "@/lib/audience";
import { OPTIONAL_CATEGORIES } from "@/lib/notification-categories";

const OPTIONAL_KEYS = new Set<string>(OPTIONAL_CATEGORIES.map((c) => c.key));

// PATCH /api/account/preferences — logged-in fan updates marketing prefs.
// Accepts subscriber_status (master on/off) and/or a categories map (partial
// map of the 6 optional category keys -> bool). The required "general"
// category has no toggle; only the master unsubscribe turns it off.
export async function PATCH(request: Request) {
  const session = await getCurrentSession();
  if (!session) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));

  const hasStatus =
    body.subscriber_status === "active" || body.subscriber_status === "unsubscribed";

  const cats: Record<string, boolean> = {};
  if (body.categories && typeof body.categories === "object") {
    for (const [k, v] of Object.entries(body.categories)) {
      if (OPTIONAL_KEYS.has(k)) cats[k] = !!v;
    }
  }

  if (!hasStatus && Object.keys(cats).length === 0) {
    return Response.json({ error: "Nothing to update" }, { status: 400 });
  }

  if (hasStatus) {
    await setSubscriberStatus(session.audienceId, body.subscriber_status);
  }
  if (Object.keys(cats).length > 0) {
    await setNotificationPrefs(session.audienceId, cats);
  }
  return Response.json({ ok: true });
}
