import { markUnsubscribedByToken } from "@/lib/audience";

// Token resolves against audience.unsubscribe_token. Mirroring to the
// legacy subscribers row happens inside the helper. Always returns 200
// (idempotent — one-click compliance must not reveal whether a token
// existed).

async function readToken(request: Request): Promise<string | null> {
  // Token can arrive on the query string (Gmail one-click) or in the body.
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get("token");
  if (fromQuery) return fromQuery;

  const ct = request.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    const body = await request.json().catch(() => ({}));
    return typeof body?.token === "string" ? body.token : null;
  }
  if (
    ct.includes("application/x-www-form-urlencoded") ||
    ct.includes("multipart/form-data")
  ) {
    const form = await request.formData().catch(() => null);
    const t = form?.get("token");
    if (typeof t === "string" && t.length > 0) return t;
  }
  return null;
}

export async function POST(request: Request) {
  const token = await readToken(request);
  if (!token) {
    return Response.json({ error: "Token required" }, { status: 400 });
  }
  await markUnsubscribedByToken(token);
  return Response.json({ ok: true });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!token) {
    return Response.json({ error: "Token required" }, { status: 400 });
  }
  await markUnsubscribedByToken(token);
  return Response.json({ ok: true });
}
