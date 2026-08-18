// Transcend the Machine - L5 "Finding Freedom" ego climax.
//
// The one Claude-powered set-piece in the game (design doc: "The Word - typing,
// recall & the AI climax"). The player types their own truth to dissolve a named
// layer of programming; Opus reads what they actually wrote and reflects it back
// in Chad's voice, and that reflection is what shatters the ring. Per the doc:
// server-side, Opus, rate-limited, safety-instructed, with a static fallback so
// a network or model failure never hard-blocks the climax.
//
// Stateless: the typed truth itself is logged separately by /api/transcend/truth.
// This route only generates the reflection and returns it.

const LAYERS = ["FAMILIAL", "SOCIAL", "RELIGIOUS", "IDENTITY", "CONSUMERIST"];

// Deterministic fallback lines, one per layer (index 0..4). Used when Opus errors
// or times out so the dissolve still lands. Chad's voice; no em-dashes, no triplets,
// no lists, no AI tells. Kept short - they read like the real reflection.
const STATIC_REFLECTIONS = [
  "That is yours to decide now, not theirs. The guilt was a leash you can drop.",
  "The room was never the judge you made it. Their watching stops mattering the second you stop performing.",
  "No one outside you gets to hand down the verdict. You can carry the awe and leave the fear.",
  "That name was assigned, not chosen. You get to author the next version.",
  "Nothing out there was ever the thing you needed. You already had the part that counts.",
];
const FINAL_STATIC =
  "You walked the whole machine and the way out was your own voice. No one handed you this. You wrote it.";

// Per-IP sliding-window limiter. In-memory, so it resets on cold start and is
// per-instance under serverless - good enough for a low-traffic spike, and it
// caps a single client hammering the route. Tighten or move to a shared store
// if this ships wide.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > MAX_PER_WINDOW;
}

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "local";
}

function systemPrompt(layer: string | null, isFinal: boolean): string {
  const base = `You are the voice of Chad Lewine at the climax of "Transcend the Machine," an anti-VR game whose whole thesis is that you do not escape the machine, you outgrow it - by using your own voice. The player has just typed a truth of their own to dissolve a layer of inherited programming. Your job is to read what they actually wrote and reflect it back so the layer can fall.

VOICE: intimate, plainspoken, deadpan-warm. You are a person who has done this work talking to someone mid-breakthrough, not a therapist, not a coach, not a brand. React to THEIR specific words. Affirm the act of authoring their own truth. Land it; do not explain it.

HARD CONSTRAINTS:
- One or two sentences. Under 30 words total.
- No em-dashes. Use commas, periods, or two sentences.
- No lists, no triplets (no three parallel clauses or three short sentences in a row).
- No therapy-speak, no hype, no "journey", no "you've got this", no AI-tell phrases.
- Write from the player's experience, not about the game's mechanics. Never mention "the machine", "the ring", "programming", "layer", or that you are an AI.
- Output ONLY the line. No preamble, no quotes around it, no labels.

SAFETY: if the truth expresses self-harm or harm to others, do not validate it. Respond with one grounding line that returns them to their own worth and points them toward a real person who can help, still in this voice.`;

  if (isFinal) {
    return `${base}

THIS IS THE FINAL TRUTH. The player has dissolved every other layer and is speaking the last one. Synthesize the whole climb into one closing line they will carry out of the game. Same constraints, same length.`;
  }
  return `${base}

The layer they are confronting right now is: ${layer ?? "their own"}. Speak to that.`;
}

// Quote and dash code points are built with fromCharCode so this source file
// stays ASCII-only. 0x2018/0x2019 = single curly, 0x201C/0x201D = double curly,
// 0x2014/0x2013 = em/en dash. The resulting regexes match those glyphs at runtime.
const SQO = String.fromCharCode(0x2018);
const SQC = String.fromCharCode(0x2019);
const DQO = String.fromCharCode(0x201c);
const DQC = String.fromCharCode(0x201d);
const EM = String.fromCharCode(0x2014);
const EN = String.fromCharCode(0x2013);
const WRAP_QUOTES = new RegExp(`^["'${SQO}${DQO}]+|["'${SQC}${DQC}]+$`, "g");
const LONG_DASH = new RegExp(`\\s*[${EM}${EN}]\\s*`, "g");

function cleanLine(text: string): string {
  let out = text.trim();
  out = out.replace(WRAP_QUOTES, "").trim();
  out = out.replace(LONG_DASH, ", ");
  return out.slice(0, 240);
}

export async function POST(req: Request) {
  let body: { level?: number; layer?: string; truth?: string; index?: number; priorTruths?: string[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "bad body" }, { status: 400 });
  }

  const truth = typeof body.truth === "string" ? body.truth.trim().slice(0, 280) : "";
  if (!truth) return Response.json({ ok: false, error: "empty" }, { status: 400 });

  const index = Number.isInteger(body.index) ? (body.index as number) : 0;
  const layer = typeof body.layer === "string" ? body.layer.slice(0, 40) : LAYERS[index] ?? null;
  const isFinal = index >= LAYERS.length - 1;
  const priorTruths = Array.isArray(body.priorTruths)
    ? body.priorTruths.filter((t): t is string => typeof t === "string").slice(0, 5).map((t) => t.slice(0, 280))
    : [];

  const staticReflection = isFinal ? FINAL_STATIC : STATIC_REFLECTIONS[index] ?? STATIC_REFLECTIONS[0];

  if (rateLimited(clientIp(req))) {
    // Never hard-block the climax - hand back the static line instead of a 429.
    return Response.json({ ok: true, reflection: staticReflection, source: "static" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ ok: true, reflection: staticReflection, source: "static" });
  }

  const userContent = isFinal
    ? `My earlier truths, in order: ${priorTruths.map((t) => `"${t}"`).join("; ") || "(none recorded)"}.\nMy final truth: "${truth}"`
    : `My truth: "${truth}"`;

  // Short, fast, single-shot. No thinking (we want a quick reflection, not
  // deliberation), tight max_tokens, server-side timeout that falls back to static.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: "claude-opus-4-8",
        max_tokens: 160,
        system: systemPrompt(layer, isFinal),
        messages: [{ role: "user", content: userContent }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[transcend/climax] Claude API error:", errText);
      return Response.json({ ok: true, reflection: staticReflection, source: "static" });
    }

    const json = await res.json();
    const raw: string = json?.content?.find((b: { type: string }) => b.type === "text")?.text || "";
    const reflection = cleanLine(raw);
    if (!reflection) {
      return Response.json({ ok: true, reflection: staticReflection, source: "static" });
    }
    return Response.json({ ok: true, reflection, source: "opus" });
  } catch (err) {
    console.error("[transcend/climax] request failed:", err);
    return Response.json({ ok: true, reflection: staticReflection, source: "static" });
  } finally {
    clearTimeout(timeout);
  }
}
