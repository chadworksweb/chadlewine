import { createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase-server";

const MIN_SECONDS = 5;
const DEDUPE_WINDOW_SECONDS = 30;

export async function POST(request: Request) {
  let body: { song_id?: string; seconds_played?: number; completed?: boolean };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }

  const song_id = String(body.song_id || "");
  const seconds_played = Math.max(0, Math.floor(Number(body.seconds_played) || 0));
  const completed = !!body.completed;

  if (!song_id) {
    return Response.json({ error: "song_id required" }, { status: 400 });
  }
  if (seconds_played < MIN_SECONDS) {
    return Response.json({ ok: true, skipped: "below_threshold" });
  }

  // Client fingerprint: short hash of IP + UA. Not PII — just enough to
  // soft-dedupe rapid re-fires and shield the table from trivial spam.
  const ua = request.headers.get("user-agent") || "";
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "";
  const client_hash = createHash("sha256")
    .update(`${ip}|${ua}`)
    .digest("hex")
    .slice(0, 32);

  const referrer = request.headers.get("referer") || null;

  const supabase = createAdminClient();

  const sinceIso = new Date(Date.now() - DEDUPE_WINDOW_SECONDS * 1000).toISOString();
  const { data: recent } = await supabase
    .from("song_play_events")
    .select("id")
    .eq("song_id", song_id)
    .eq("client_hash", client_hash)
    .gte("played_at", sinceIso)
    .limit(1);
  if (recent && recent.length > 0) {
    return Response.json({ ok: true, skipped: "deduped" });
  }

  const { error } = await supabase.from("song_play_events").insert({
    song_id,
    seconds_played,
    completed,
    client_hash,
    referrer,
  });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}
