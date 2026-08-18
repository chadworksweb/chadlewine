import { cookies } from "next/headers";
import { resolveActor, getProgress, saveProgress, type TmInventory } from "@/lib/transcend-progress";

// Transcend the Machine - load (GET) / save (POST) per-player progress.
// Signed-in players are resolved from their sb-access-token cookie; anon play is
// keyed by the `sid` (session id) the client generates and keeps in localStorage.

export async function GET(req: Request) {
  const sid = new URL(req.url).searchParams.get("sid");
  const token = (await cookies()).get("sb-access-token")?.value;
  const actor = await resolveActor(token);
  try {
    const progress = await getProgress(actor, sid);
    return Response.json({ ok: true, progress });
  } catch {
    // Table not migrated yet, or a transient read error: behave as "no progress"
    // so the game still loads.
    return Response.json({ ok: true, progress: null });
  }
}

export async function POST(req: Request) {
  let body: { sessionId?: string; currentLevel?: number; inventory?: TmInventory };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "bad body" }, { status: 400 });
  }

  const sessionId = typeof body.sessionId === "string" ? body.sessionId.slice(0, 64) : null;
  const currentLevel = Number.isFinite(body.currentLevel) ? Number(body.currentLevel) : 1;
  const inventory: TmInventory =
    body.inventory && typeof body.inventory === "object"
      ? { key: !!body.inventory.key, rune: !!body.inventory.rune }
      : {};

  const token = (await cookies()).get("sb-access-token")?.value;
  const actor = await resolveActor(token);
  try {
    await saveProgress({ actor, sessionId, currentLevel, inventory });
    return Response.json({ ok: true });
  } catch {
    // Don't surface persistence failures to gameplay.
    return Response.json({ ok: false });
  }
}
