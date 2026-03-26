// POST /api/admin/suggest-lines
// AI-assisted hook & tension line suggestion using Claude Opus
// Auth-gated via proxy.ts

export async function POST(request: Request) {
  const { body, field } = await request.json();

  if (!body || !field) {
    return Response.json({ error: "body and field are required" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  const systemPrompt = `You are analyzing an Observation (a cross-domain essay by Chad Lewine) to identify candidate sentences for two fields. Extract sentences verbatim from the body — do not rewrite, paraphrase, or combine. Return JSON only, no markdown wrapping.

For "hook" field: Find 3-5 sentences that are the most provocative — the line that stops someone mid-scroll, feeds the Diddy (a 31-second audio clip), becomes the Hook fragment. Selection criteria: standalone impact, extractability, surprise, quotability, works as a meta description fallback.

For "tension" field: Find 3-5 sentences where the Observation's polarity lives — the contradiction, the sharpest inversion, the thing the piece holds in tension. Selection criteria: clearest contradiction, strongest polarity, most surprising inversion.

Return this exact JSON structure:
{
  "hook_candidates": [{ "sentence": "...", "rationale": "...", "source_position": 1 }],
  "tension_candidates": [{ "sentence": "...", "rationale": "...", "source_position": 1 }]
}

Only populate the array for the requested field. Leave the other as an empty array.`;

  // Strip HTML for cleaner analysis
  const plainBody = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

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
        max_tokens: 1024,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: `Analyze this Observation body for ${field} line candidates:\n\n${plainBody}`,
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
    const content = data.content?.[0]?.text || "{}";

    // Parse JSON from response (handle potential markdown wrapping)
    let parsed;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);
    } catch {
      return Response.json({ error: "Failed to parse Claude response" }, { status: 502 });
    }

    return Response.json({
      hook_candidates: parsed.hook_candidates || [],
      tension_candidates: parsed.tension_candidates || [],
    });
  } catch (err) {
    console.error("Suggest lines error:", err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
