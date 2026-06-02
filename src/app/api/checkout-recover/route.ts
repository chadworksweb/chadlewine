import { getResumableSession } from "@/lib/stripe";

// Resume an abandoned embedded (physical) cart checkout from a recovery email
// link (/checkout?recover=<sessionId>). Returns the session's client_secret so
// the /checkout page can re-mount embedded checkout cross-device. Session ids
// are unguessable; we only return secrets for still-open cart sessions.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const sessionId = new URL(request.url).searchParams.get("session");
  if (!sessionId) {
    return Response.json({ error: "Missing session" }, { status: 400 });
  }
  try {
    const resumable = await getResumableSession(sessionId);
    if (!resumable) {
      return Response.json({ error: "Session not resumable" }, { status: 404 });
    }
    return Response.json(resumable);
  } catch {
    return Response.json({ error: "Session not resumable" }, { status: 404 });
  }
}
