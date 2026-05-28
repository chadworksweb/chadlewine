import { createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase-server";
import { getCurrentSession } from "@/lib/account";

// Max times an anonymous device may play a given song before it is gated.
// A play only counts once the listener has heard the threshold (30s), enforced
// in PlayerContext which fires action:"record" at that point. 2 free plays;
// the 3rd is blocked.
const ANON_PLAY_LIMIT = 2;

// Anonymous device fingerprint: short hash of IP + UA. Same shape as /api/play.
function clientHash(request: Request): string {
  const ua = request.headers.get("user-agent") || "";
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "";
  return createHash("sha256").update(`${ip}|${ua}`).digest("hex").slice(0, 32);
}

// Two actions:
//   check  (default) - read-only. Returns whether this device is at/over the
//                      limit. Called by PlayerContext at the start of a play.
//   record           - increments this device's count for the song. Called by
//                      PlayerContext once a play crosses the 30s threshold.
//
// Logged-in fans are unlimited (never gated, never counted). Both actions fail
// OPEN on error so a gate hiccup never breaks playback.
export async function POST(request: Request) {
  let body: { song_id?: string; action?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }

  const song_id = String(body.song_id || "");
  const action = body.action === "record" ? "record" : "check";
  if (!song_id) {
    return Response.json({ error: "song_id required" }, { status: 400 });
  }

  try {
    const session = await getCurrentSession();
    if (session) {
      return Response.json({ blocked: false, unlimited: true });
    }
  } catch {
    // Session resolution failed -- treat as anonymous and continue.
  }

  const supabase = createAdminClient();
  const hash = clientHash(request);

  if (action === "record") {
    const { data, error } = await supabase.rpc("anon_song_play_record", {
      p_song_id: song_id,
      p_client_hash: hash,
    });
    if (error) {
      return Response.json({ ok: false, error: error.message });
    }
    const plays = typeof data === "number" ? data : Array.isArray(data) ? data[0] : null;
    return Response.json({ ok: true, plays });
  }

  const { data, error } = await supabase
    .from("anon_song_plays")
    .select("play_count")
    .eq("song_id", song_id)
    .eq("client_hash", hash)
    .maybeSingle();
  if (error) {
    return Response.json({ blocked: false, unlimited: false, error: error.message });
  }
  const plays = data?.play_count ?? 0;
  return Response.json({
    blocked: plays >= ANON_PLAY_LIMIT,
    plays,
    limit: ANON_PLAY_LIMIT,
    unlimited: false,
  });
}
