import { cookies } from "next/headers";

export async function POST(request: Request) {
  const body = await request.json();
  const { access_token, refresh_token } = body;

  if (!access_token || !refresh_token) {
    return Response.json({ error: "Missing tokens" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const isProduction = process.env.NODE_ENV === "production";

  cookieStore.set("sb-access-token", access_token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60, // 1 hour
  });

  cookieStore.set("sb-refresh-token", refresh_token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  return Response.json({ ok: true });
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete("sb-access-token");
  cookieStore.delete("sb-refresh-token");
  return Response.json({ ok: true });
}
