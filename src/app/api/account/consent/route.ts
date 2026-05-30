import { getCurrentSession } from "@/lib/account";
import { getConsent, setConsent } from "@/lib/audience";

// Cookie-consent for signed-in fans. The cl_cookie_consent cookie is the
// runtime source of truth; this endpoint persists/reads the account-backed copy
// so a fan's choice follows them across devices (ConsentProvider reconciles).

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return Response.json({ authenticated: false, consent: null });
  const consent = await getConsent(session.audienceId);
  return Response.json({ authenticated: true, consent });
}

export async function PATCH(request: Request) {
  const session = await getCurrentSession();
  if (!session) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const consent = {
    functional: !!body.functional,
    analytics: !!body.analytics,
    marketing: !!body.marketing,
  };
  await setConsent(session.audienceId, consent);
  return Response.json({ ok: true, consent });
}
