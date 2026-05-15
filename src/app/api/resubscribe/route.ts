import { markResubscribedByToken } from "@/lib/audience";

export async function POST(request: Request) {
  let token: string | null = null;
  const ct = request.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    const body = await request.json().catch(() => ({}));
    token = typeof body?.token === "string" ? body.token : null;
  }
  if (!token) {
    token = new URL(request.url).searchParams.get("token");
  }
  if (!token) {
    return Response.json({ error: "Token required" }, { status: 400 });
  }
  await markResubscribedByToken(token);
  return Response.json({ ok: true });
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) {
    return Response.json({ error: "Token required" }, { status: 400 });
  }
  await markResubscribedByToken(token);
  return Response.json({ ok: true });
}
