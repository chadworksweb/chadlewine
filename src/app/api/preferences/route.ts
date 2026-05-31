import {
  setNotificationPrefsByToken,
  markUnsubscribedByToken,
  markResubscribedByToken,
} from "@/lib/audience";
import { OPTIONAL_CATEGORIES } from "@/lib/notification-categories";

const OPTIONAL_KEYS = new Set<string>(OPTIONAL_CATEGORIES.map((c) => c.key));

// PATCH /api/preferences — token-gated prefs for email-only subscribers (no
// account). The token is the audience.unsubscribe_token already embedded in
// every email footer link. Accepts subscriber_status (master on/off, reusing
// the existing token helpers) and/or a categories map of the 6 optional keys.
// Always returns ok (idempotent) so it never reveals whether a token existed.
export async function PATCH(request: Request) {
  const body = await request.json().catch(() => ({}));
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token) {
    return Response.json({ error: "Token required" }, { status: 400 });
  }

  // Master subscribe / unsubscribe by token.
  if (body.subscriber_status === "unsubscribed") {
    await markUnsubscribedByToken(token);
  } else if (body.subscriber_status === "active") {
    await markResubscribedByToken(token);
  }

  // Optional-category toggles.
  const cats: Record<string, boolean> = {};
  if (body.categories && typeof body.categories === "object") {
    for (const [k, v] of Object.entries(body.categories)) {
      if (OPTIONAL_KEYS.has(k)) cats[k] = !!v;
    }
  }
  if (Object.keys(cats).length > 0) {
    await setNotificationPrefsByToken(token, cats);
  }

  return Response.json({ ok: true });
}
