// Proxy to api.risingcompass.net/api/analyzer/calibrate-lyrics.
// Uses chadlewine's service key so first-party callers skip bot
// protection; we tag source="chadlewine" for downstream analytics.

const RC_API_BASE = process.env.RC_API_BASE || "https://api.risingcompass.net";
const RC_API_KEY = process.env.RC_SERVICE_API_KEY || "";

export async function POST(request: Request) {
  if (!RC_API_KEY) {
    return Response.json(
      { error: "RC_SERVICE_API_KEY not configured" },
      { status: 500 }
    );
  }

  let body: { lyrics?: string; title?: string; artist?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const lyrics = (body.lyrics || "").trim();
  const title = (body.title || "").trim();
  const artist = (body.artist || "").trim();

  if (lyrics.length < 20) {
    return Response.json(
      { error: "Lyrics must be at least 20 characters." },
      { status: 422 }
    );
  }
  if (lyrics.length > 20000) {
    return Response.json(
      { error: "Lyrics too long (20,000 character max)." },
      { status: 422 }
    );
  }
  if (!title) {
    return Response.json({ error: "Song title is required." }, { status: 422 });
  }
  if (!artist) {
    return Response.json({ error: "Artist is required." }, { status: 422 });
  }

  try {
    const res = await fetch(
      `${RC_API_BASE}/api/analyzer/calibrate-lyrics`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": RC_API_KEY,
        },
        body: JSON.stringify({
          lyrics,
          title,
          artist,
          source: "chadlewine",
        }),
      }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return Response.json(data, { status: res.status });
    }
    return Response.json(data);
  } catch (err) {
    return Response.json(
      { error: "Proxy fetch failed", detail: (err as Error).message },
      { status: 502 }
    );
  }
}
