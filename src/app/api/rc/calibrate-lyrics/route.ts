// Proxy to api.risingcompass.net/api/analyzer/calibrate-lyrics.
// Uses chadlewine's service key so first-party callers skip bot
// protection. The caller may self-tag the originating surface via
// `source` (sanitized to a slug, max 20 chars to fit RC's column);
// defaults to "chadlewine" for downstream analytics.

const RC_API_BASE = process.env.RC_API_BASE || "https://api.risingcompass.net";
const RC_API_KEY = process.env.RC_SERVICE_API_KEY || "";

export async function POST(request: Request) {
  if (!RC_API_KEY) {
    return Response.json(
      { error: "RC_SERVICE_API_KEY not configured" },
      { status: 500 }
    );
  }

  let body: { lyrics?: string; title?: string; artist?: string; source?: string };
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

  // Caller-supplied origin tag (e.g. "super-individual" from the SI mini-charger).
  // Sanitize to a lowercase slug and cap at 20 chars (RC's submitted_songs.source
  // column is VARCHAR(20)); fall back to the generic client tag.
  const source =
    (body.source || "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 20) ||
    "chadlewine";

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
          source,
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
