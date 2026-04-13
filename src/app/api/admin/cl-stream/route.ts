import { createAdminClient } from "@/lib/supabase-server";
import { fetchBadge } from "@/lib/rising-compass";

const RC_API_URL = process.env.RISING_COMPASS_API_URL || "https://api.risingcompass.net";
const RC_API_KEY = process.env.RISING_COMPASS_API_KEY || "";

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

  // 1. Check if Rising Compass already has this song
  const badge = await fetchBadge(title, artist);

  // 2. No badge + no lyrics = ask for lyrics
  if (!badge && !body.lyrics?.trim()) {
    return Response.json({ needs_lyrics: true }, { status: 202 });
  }

  let rcColor: string | null = null;
  let rcCharge: number | null = null;
  let rcContaminated = false;
  let rcChargeSummary: string | null = null;

  if (badge) {
    // Use existing RC data
    rcColor = badge.tier ?? null;
    rcCharge = badge.charge ?? null;
    rcContaminated = badge.contaminated ?? false;
    rcChargeSummary = badge.charge_summary ?? null;
  } else if (body.lyrics?.trim()) {
    // Calibrate via RC using provided lyrics
    try {
      const res = await fetch(`${RC_API_URL}/api/analyzer/calibrate-lyrics`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Api-Key": RC_API_KEY },
        body: JSON.stringify({ title, artist, lyrics: body.lyrics.trim() }),
      });
      if (res.ok) {
        const cal = await res.json();
        rcColor = cal.rubric_color ?? null;
        rcCharge = cal.charge_value ?? null;
        rcContaminated = cal.contaminated ?? false;
        rcChargeSummary = cal.charge_summary ?? null;
      }
    } catch {
      // Calibration failed — store without RC data rather than blocking
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
      rc_color: rcColor,
      rc_charge: rcCharge,
      rc_contaminated: rcContaminated,
      rc_charge_summary: rcChargeSummary,
      status: "published",
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data, { status: 201 });
}
