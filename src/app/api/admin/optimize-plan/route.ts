import { createAdminClient } from "@/lib/supabase-server";

// POST /api/admin/optimize-plan
// AI analyzes the observation and produces an actionable plan to reach 100/100 GEO score
// Uses Chad's voice profile from Supabase for voice-matched suggestions

export async function POST(request: Request) {
  const data = await request.json();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  // Fetch voice profile from Supabase
  const supabase = createAdminClient();
  const { data: vpRow } = await supabase
    .from("voice_profile")
    .select("content")
    .limit(1)
    .single();
  const voiceProfile = vpRow?.content || "";

  const plainBody = (data.body || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  const currentState = (data.breakdown || [])
    .map((b: { label: string; points: number; max: number; status: string }) =>
      `- ${b.label}: ${b.points}/${b.max} (${b.status})`
    )
    .join("\n");

  const voiceSection = voiceProfile
    ? `\n\nIMPORTANT — VOICE PROFILE:\nAll suggested text (citation summaries, PAA answers, SEO descriptions, hook/tension candidates) MUST match Chad Lewine's voice. Here is his voice profile:\n\n${voiceProfile}`
    : "";

  const systemPrompt = `You are a GEO/SEO optimization analyst for chadlewine.com. You analyze Observations (cross-domain essays by Chad Lewine) and produce actionable optimization plans.

Given the current GEO readiness score breakdown and the observation body, produce a concrete plan to reach 100/100. For each gap, provide:
- A specific action the author should take
- A brief detail explaining what to write or do — when suggesting text, write it IN CHAD'S VOICE (see voice profile below)
- How many points it would gain

Group actions by scoring category. Only include categories that have room to improve. Be specific — don't say "add a citation summary", say "Write: 'According to Chad Lewine, [specific suggestion based on the body content]'". Reference actual content from the body.

When suggesting citation summaries, PAA answers, SEO descriptions, or any text Chad would publish — use his actual voice patterns: no emdashes, no triplets, no hedging filler, no corporate jargon, declarative tone, grounded in lived experience. The suggestion should sound like something Chad actually wrote.${voiceSection}

Return ONLY valid JSON (no markdown wrapping) in this exact structure:
{
  "plan": [
    {
      "section": "Category Name",
      "items": [
        { "action": "Do this specific thing", "detail": "Because of X in the body, write Y", "points": "5" }
      ]
    }
  ]
}`;

  const userMessage = `Current score: ${data.score}/100

Score breakdown:
${currentState}

Current field values:
- Focus keyphrase: ${data.focusKeyphrase || "(empty)"}
- Citation summary: ${data.citationSummary || "(empty)"}
- First sentence extractable: ${data.firstSentenceExtractable ? "yes" : "no"}
- Secondary keyphrases: ${JSON.stringify(data.secondaryKeyphrases || [])}
- Entity tags: ${JSON.stringify(data.entityTags || [])}
- PAA pairs: ${JSON.stringify(data.paaPairs || [])}
- OG image set: ${data.artImagePath ? "yes" : "no"}
- OG alt set: ${data.artAlt ? "yes" : "no"}
- SEO title: ${data.seoTitle || "(empty)"}
- SEO description: ${data.seoDescription || "(empty)"}

Observation body:
${plainBody.slice(0, 6000)}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-7",
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Claude API error:", errText);
      return Response.json({ error: "Claude API request failed" }, { status: 502 });
    }

    const result = await res.json();
    const content = result.content?.[0]?.text || "{}";

    let parsed;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);
    } catch {
      return Response.json({ error: "Failed to parse response" }, { status: 502 });
    }

    return Response.json({ plan: parsed.plan || [] });
  } catch (err) {
    console.error("Optimize plan error:", err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
