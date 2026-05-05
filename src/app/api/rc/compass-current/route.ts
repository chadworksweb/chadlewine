// Proxy to api.risingcompass.net/api/compass/current.
// Avoids cross-origin browser calls and hides the API key.

const RC_API_BASE = process.env.RC_API_BASE || "https://api.risingcompass.net";
const RC_API_KEY = process.env.RC_SERVICE_API_KEY || "";

export const revalidate = 300;

export async function GET() {
  if (!RC_API_KEY) {
    return Response.json(
      { error: "RC_SERVICE_API_KEY not configured" },
      { status: 500 }
    );
  }

  try {
    const res = await fetch(`${RC_API_BASE}/api/compass/current`, {
      headers: { "x-api-key": RC_API_KEY },
      next: { revalidate: 300 },
    });
    if (!res.ok) {
      const text = await res.text();
      return Response.json(
        { error: `RC API ${res.status}`, detail: text.slice(0, 500) },
        { status: 502 }
      );
    }
    const data = await res.json();
    return Response.json(data);
  } catch (err) {
    return Response.json(
      { error: "Proxy fetch failed", detail: (err as Error).message },
      { status: 502 }
    );
  }
}
