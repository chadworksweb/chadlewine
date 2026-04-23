import { createAdminClient } from "@/lib/supabase-server";
import { fetchBadge } from "@/lib/rising-compass";

const RC_API_URL = process.env.RISING_COMPASS_API_URL || "https://api.risingcompass.net";
const RC_API_KEY = process.env.RISING_COMPASS_API_KEY || "";
// First-party calibration key — when set, calibrate-lyrics calls bypass bot
// protection and tag submissions as source="chadlewine" instead of polluting
// the public Lyrical Charger activity log.
const RC_SERVICE_KEY = process.env.RISING_COMPASS_SERVICE_KEY || "";

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("cl_stream_songs")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function POST(request: Request) {
  const supabase = createAdminClient();
  const body = await request.json();

  const title = body.title?.trim();
  const artist = body.artist?.trim();
  if (!title || !artist) {
    return Response.json({ error: "title and artist required" }, { status: 400 });
  }

  // RC ownership model: we do NOT store a local copy of tier/charge/summary.
  // The only reason to call RC here is to decide whether the admin needs to
  // paste lyrics — if RC already has the song we're good; if not we push
  // the lyrics through calibrate-lyrics so RC gets the song. Either way,
  // display-time reads come from fetchBadge live.
  const badge = await fetchBadge(title, artist);
  if (!badge && !body.lyrics?.trim()) {
    return Response.json({ needs_lyrics: true }, { status: 202 });
  }
  if (!badge && body.lyrics?.trim()) {
    try {
      await fetch(`${RC_API_URL}/api/analyzer/calibrate-lyrics`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": RC_SERVICE_KEY || RC_API_KEY,
        },
        body: JSON.stringify({
          title,
          artist,
          lyrics: body.lyrics.trim(),
          source: "chadlewine",
        }),
      });
    } catch {
      // Calibration failed — entry still publishes; badge will appear once
      // RC has the song, since reads are live.
    }
  }

  const { data, error } = await supabase
    .from("cl_stream_songs")
    .insert({
      title,
      artist,
      album: body.album?.trim() || null,
      note: body.note?.trim() || null,
      source_url: body.source_url || null,
      source_platform: body.source_platform || null,
      status: "published",
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data, { status: 201 });
}
