import { cookies } from "next/headers";
import { resolveActor, markComplete } from "@/lib/transcend-progress";

// Transcend the Machine - fired when the journey is finished (L5 transcended).
// Marks tm_progress.completed (idempotent), grants the merch coupon to a
// signed-in player, and logs a `transcend_completed` audience event for the
// pixel wall. Anon players just get the completed flag.

export async function POST(req: Request) {
  let body: { sessionId?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const sessionId = typeof body.sessionId === "string" ? body.sessionId.slice(0, 64) : null;

  const token = (await cookies()).get("sb-access-token")?.value;
  const actor = await resolveActor(token);
  try {
    const result = await markComplete({ actor, sessionId });
    return Response.json(result);
  } catch {
    // Completion is a celebration, not a transaction - never fail the player.
    return Response.json({ ok: true, alreadyCompleted: false, couponCode: null });
  }
}
