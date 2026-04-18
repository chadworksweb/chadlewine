import { fetchBadge } from "@/lib/rising-compass";

const RC_API_URL = process.env.RISING_COMPASS_API_URL || "https://api.risingcompass.net";
const RC_API_KEY = process.env.RISING_COMPASS_API_KEY || "";
const RC_SERVICE_KEY = process.env.RISING_COMPASS_SERVICE_KEY || "";

export async function POST(request: Request) {
  const { title, artist, lyrics } = await request.json();

  if (!title || !lyrics) {
    return Response.json({ error: "title and lyrics required" }, { status: 400 });
  }

  const key = RC_SERVICE_KEY || RC_API_KEY;
  if (!key) {
    return Response.json({ error: "Rising Compass API key not configured" }, { status: 500 });
  }

  try {
    const res = await fetch(`${RC_API_URL}/api/analyzer/calibrate-lyrics`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": key,
      },
      body: JSON.stringify({
        title: title.trim(),
        artist: (artist || "Chad Lewine").trim(),
        lyrics,
        source: "chadlewine",
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      return Response.json({ error: data.detail || "Calibration failed" }, { status: res.status });
    }

    return Response.json(data);
  } catch {
    return Response.json({ error: "Failed to reach Rising Compass API" }, { status: 502 });
  }
}
