import { confirmSubscriptionByToken } from "@/lib/audience";
import { publicOrigin } from "@/lib/request-origin";

/* Double opt-in confirmation endpoint.

   The confirm link in the email points at the /confirm PAGE (a GET), which
   only looks the token up and shows a button. The actual state change is this
   explicit POST from that button -- mirroring the unsubscribe flow -- so email
   security scanners that GET every link on delivery cannot auto-confirm a dead
   address and defeat the point of double opt-in.

   GET here just bounces to the page (in case the API URL is hit directly). */

async function readToken(request: Request): Promise<string | null> {
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get("token");
  if (fromQuery) return fromQuery;
  const ct = request.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    const body = await request.json().catch(() => ({}));
    return typeof body?.token === "string" ? body.token : null;
  }
  return null;
}

export async function POST(request: Request) {
  const token = await readToken(request);
  if (!token) return Response.json({ error: "Token required" }, { status: 400 });
  const outcome = await confirmSubscriptionByToken(token);
  if (outcome === "not-found") {
    return Response.json({ error: "Link not found", outcome }, { status: 404 });
  }
  return Response.json({ ok: true, outcome });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const dest = new URL("/confirm", publicOrigin(request));
  if (token) dest.searchParams.set("token", token);
  return Response.redirect(dest, 303);
}
