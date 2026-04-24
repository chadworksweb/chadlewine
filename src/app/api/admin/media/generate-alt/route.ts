// POST /api/admin/media/generate-alt
// Generates SEO-optimized alt text for a media image using Claude vision.
// Auth-gated via proxy.ts (admin surface).

const SYSTEM_PROMPT =
  "You write SEO-optimized alt text for abstract digital art images. Output ONLY the alt text string — no quotes, no labels, no explanation. 125 characters max. Describe dominant colors, light quality, shapes, and composition only. No artist attribution. No figurative interpretation unless visually unambiguous. No emotional language. Do not start with 'Image of' or 'Picture of'. End with a period.";

export async function POST(request: Request) {
  const { url } = await request.json();

  if (!url || typeof url !== "string") {
    return Response.json({ error: "url (string) is required" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-6",
        max_tokens: 256,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "url", url } },
              { type: "text", text: "Write alt text for this image per the SOP." },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Claude API error:", errText);
      return Response.json({ error: "Claude API request failed" }, { status: 502 });
    }

    const data = await res.json();
    const raw = data.content?.[0]?.text || "";

    // Strip wrapping quotes/whitespace just in case the model added any.
    let alt = raw.trim().replace(/^["']|["']$/g, "").trim();

    // Hard cap at 125 chars per SOP. Prefer the last sentence boundary.
    if (alt.length > 125) {
      const truncated = alt.slice(0, 125);
      const lastPeriod = truncated.lastIndexOf(".");
      alt = lastPeriod > 60 ? truncated.slice(0, lastPeriod + 1) : truncated.replace(/[,;:\s]+$/, "") + ".";
    }
    if (!alt.endsWith(".")) alt += ".";

    return Response.json({ alt_text: alt });
  } catch (err) {
    console.error("Generate-alt error:", err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
