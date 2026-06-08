// Inbound message triage -- the "manager" layer.
//
// Classifies an inbound message (contact-form submission or campaign reply)
// so the front desk can decide what reaches Chad. Only positive notes and
// real opportunities ping him; everything else is logged + digested.
//
// Uses Claude Opus directly (same fetch pattern as /api/admin/suggest-lines).
// Throws on any failure so the caller can fail CLOSED -- a triage error must
// never produce a ping, only a queued message a human reviews.

export type InboundCategory =
  | "positive_note"
  | "opportunity"
  | "favor_ask"
  | "criticism"
  | "hostile"
  | "spam"
  | "other";

export interface TriageResult {
  category: InboundCategory;
  tone: string;
  summary: string;
  is_priority: boolean;
}

const CATEGORIES: InboundCategory[] = [
  "positive_note",
  "opportunity",
  "favor_ask",
  "criticism",
  "hostile",
  "spam",
  "other",
];

// Only these two reach Chad immediately.
const PRIORITY_CATEGORIES = new Set<InboundCategory>(["positive_note", "opportunity"]);

const SYSTEM_PROMPT = `You are the front-desk manager for Chad Lewine, an independent musician and writer. People write to him by replying to his email campaigns or via his website contact form. Your job is to triage each message the way a thoughtful personal manager would -- protecting his attention while never burying something that genuinely matters.

Classify the message into exactly one category:
- "positive_note": genuine warmth, gratitude, encouragement, a fan moved by the work. No ask, or only a light one. The kind of note that is good for him to see.
- "opportunity": a real, actionable opportunity -- press, booking, collaboration, licensing, sync, paid work, a venue, a partnership, business interest, media. Something with upside he would not want to miss.
- "favor_ask": wants something from him -- feedback on their work, a free favor, advice, a connection, "check out my song", promotion. Not hostile, just a burden.
- "criticism": disagreement, critique, or negative opinion delivered without abuse. Has a point but is not a threat.
- "hostile": insults, contempt, abuse, threats, hate. Nothing he needs to see.
- "spam": automated, bulk, scams, SEO/marketing pitches, link spam, unrelated solicitation.
- "other": anything that fits none of the above.

Return ONLY a JSON object, no markdown, with exactly these fields:
{
  "category": one of [${CATEGORIES.map((c) => `"${c}"`).join(", ")}],
  "tone": a 1-3 word lowercase description of the emotional tone (e.g. "warm", "angry", "demanding", "neutral", "excited"),
  "summary": one plain sentence (max 140 chars) capturing what they actually said and want. Write it for Chad, third person, no preamble.
}

Be conservative about "opportunity" and "positive_note": only use them when the message truly earns an interruption. When uncertain between a priority and a non-priority category, choose the non-priority one.`;

interface TriageInput {
  from_name?: string | null;
  from_email: string;
  subject?: string | null;
  body: string;
}

function isCategory(v: unknown): v is InboundCategory {
  return typeof v === "string" && (CATEGORIES as string[]).includes(v);
}

export async function triageInboundMessage(input: TriageInput): Promise<TriageResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  // Keep the prompt bounded -- long pastes get truncated for classification.
  const body = (input.body || "").slice(0, 6000);
  const userContent = [
    `From: ${input.from_name ? `${input.from_name} ` : ""}<${input.from_email}>`,
    input.subject ? `Subject: ${input.subject}` : null,
    "",
    "Message:",
    body || "(empty)",
  ]
    .filter((l) => l !== null)
    .join("\n");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-opus-4-8",
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Claude triage request failed (${res.status}): ${errText.slice(0, 300)}`);
  }

  const data = (await res.json()) as { content?: Array<{ text?: string }> };
  const text = data.content?.[0]?.text || "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("Triage response had no JSON object");
  }

  const parsed = JSON.parse(match[0]) as {
    category?: unknown;
    tone?: unknown;
    summary?: unknown;
  };

  const category = isCategory(parsed.category) ? parsed.category : "other";
  const tone = typeof parsed.tone === "string" ? parsed.tone.slice(0, 40) : "";
  const summary = typeof parsed.summary === "string" ? parsed.summary.slice(0, 200) : "";

  return {
    category,
    tone,
    summary,
    is_priority: PRIORITY_CATEGORIES.has(category),
  };
}
