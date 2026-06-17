import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase-server";

// Transcend the Machine - log a truth the player typed at the L5 ego climax to
// their account. Signed-in only (the level is gated behind a free account); the
// player is identified from their sb-access-token cookie, and the row is written
// with the service role (tm_truths has RLS on with no public policies).
export async function POST(req: Request) {
  let body: { level?: number; layer?: string; truth?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "bad body" }, { status: 400 });
  }

  const truth = typeof body.truth === "string" ? body.truth.trim().slice(0, 280) : "";
  if (!truth) return Response.json({ ok: false, error: "empty" }, { status: 400 });
  const level = Number.isInteger(body.level) ? (body.level as number) : 5;
  const layer = typeof body.layer === "string" ? body.layer.slice(0, 40) : null;

  const cookieStore = await cookies();
  const token = cookieStore.get("sb-access-token")?.value;
  if (!token) return Response.json({ ok: false, reason: "anon" });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return Response.json({ ok: false, reason: "anon" });

  const admin = createAdminClient();
  const { error: insertError } = await admin.from("tm_truths").insert({
    user_id: data.user.id,
    email: data.user.email ?? null,
    level,
    layer,
    truth,
  });
  if (insertError) return Response.json({ ok: false, error: "insert" }, { status: 500 });

  return Response.json({ ok: true });
}
