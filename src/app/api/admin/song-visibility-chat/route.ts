import { createAdminClient } from "@/lib/supabase-server";
import { fetchBadge } from "@/lib/rising-compass";
import { VISIBILITY_CATEGORIES } from "@/lib/song-visibility";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Three categories whose layers are written verbatim by Chad — never composed
// by Claude. The chat collects each layer in three prompts, then emits the
// <visibility:slug> block with Chad's text pasted unchanged into the tags.
const VERBATIM_CATEGORIES = new Set(["story", "world", "audience"]);

function needsGeoFieldsHint(song: { citation_summary?: string | null; entity_tags?: string[] | null }): boolean {
  return !song.citation_summary || !song.entity_tags || song.entity_tags.length === 0;
}

async function resolveSongId(
  supabase: ReturnType<typeof createAdminClient>,
  idOrSlug: string,
): Promise<string | null> {
  if (UUID_RE.test(idOrSlug)) return idOrSlug;
  const { data } = await supabase.from("songs").select("id").eq("slug", idOrSlug).maybeSingle();
  return data?.id ?? null;
}

export async function POST(request: Request) {
  const { song_id: songIdOrSlug, message, category, geoOnly } = await request.json();
  if (!songIdOrSlug) return Response.json({ error: "song_id required" }, { status: 400 });

  // Optional: when present, scope generation to a single category (per-section
  // regenerate). When absent, the original interview flow runs unchanged.
  const focusCategory = category
    ? VISIBILITY_CATEGORIES.find((c) => c.slug === category) || null
    : null;
  if (category && !focusCategory) {
    return Response.json({ error: "unknown category" }, { status: 400 });
  }
  // geoOnly mode: regenerate ONLY the songs.citation_summary / entity_tags /
  // chad_quote that drive the public "About / Topics & themes" section.
  const geoFieldsOnly = !!geoOnly;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });

  const supabase = createAdminClient();

  // Frontends call us with either the song's UUID (from form.id) or its slug
  // (from useParams on the visibility page). Resolve once, then use UUID
  // everywhere downstream.
  const song_id = await resolveSongId(supabase, songIdOrSlug);
  if (!song_id) return Response.json({ error: "Song not found" }, { status: 404 });

  // Geo-only path is a non-streaming, focused regen. Handles the common case
  // where the public "About / Topics & themes" panel is empty because Claude
  // never emitted a <geo-fields> block during the original chat.
  if (geoFieldsOnly) {
    return regenerateGeoFields(song_id, apiKey, supabase);
  }

  // Load all context in parallel
  const [
    { data: song },
    { data: junction },
    { data: vpRow },
    { data: catalog },
    { data: catalogAlbums },
    { data: catalogArt },
    { data: history },
    { data: existingSections },
  ] = await Promise.all([
    supabase.from("songs").select("*").eq("id", song_id).single(),
    supabase.from("release_songs")
      .select("track_number, release:releases(id, title, slug)")
      .eq("song_id", song_id)
      .single(),
    supabase.from("voice_profile").select("content").limit(1).single(),
    supabase.from("songs")
      .select("id, title, slug, song_summary")
      .neq("id", song_id)
      .eq("status", "published"),
    supabase.from("releases").select("id, title, slug").eq("status", "published"),
    supabase
      .from("art_pieces")
      .select("id, title, slug")
      .in("status", ["unreleased", "published"]),
    supabase.from("song_visibility_messages")
      .select("*")
      .eq("song_id", song_id)
      .order("created_at"),
    supabase.from("song_visibility_sections")
      .select("category, content, direct_answer, key_points")
      .eq("song_id", song_id),
  ]);

  if (!song) return Response.json({ error: "Song not found" }, { status: 404 });

  const album = (junction as any)?.album;
  const voiceProfile = vpRow?.content || "";
  const badge = await fetchBadge(song.title, "Chad Lewine");

  // Save user message if provided. For per-section / geo regenerations, don't
  // write to chat history — the interview thread should stay clean.
  if (message && !focusCategory && !geoFieldsOnly) {
    await supabase.from("song_visibility_messages").insert({
      song_id,
      role: "user",
      content: message,
    });
  }

  // Build conversation messages. Per-section regen and geo regen run as a
  // one-shot — no chat history attached.
  let messages: Array<{ role: "user" | "assistant"; content: string }>;
  if (geoFieldsOnly) {
    messages = [
      {
        role: "user",
        content: `Regenerate the public "About / Topics & themes" panel for this song. Output ONLY a single <geo-fields> block. No <visibility:...> categories. No narration.`,
      },
    ];
  } else if (focusCategory) {
    const isVerbatim = VERBATIM_CATEGORIES.has(focusCategory.slug);
    messages = [
      {
        role: "user",
        content: isVerbatim
          ? `Re-emit the <visibility:${focusCategory.slug}> block for "${focusCategory.label}" using Chad's verbatim text from the prior interview shown in CURRENT STATE above. Paste his exact direct-answer, prose, and key-points into the layer tags — DO NOT rewrite, polish, summarize, or compose. If any of the three layers is missing from prior context, ask Chad for it instead of making one up.`
          : `Generate the "${focusCategory.label}" section ONLY. Use the voice profile, the lyrics, and any prior interview context shown in CURRENT STATE above. Output exactly one <visibility:${focusCategory.slug}> block with the full format stack — no other categories on this turn.`,
      },
    ];
  } else {
    messages = (history || []).map((m: any) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));
  }

  if (!focusCategory && !geoFieldsOnly && message) {
    messages.push({ role: "user", content: message });
  }

  // If no messages at all (initial kick-off of the interview chat), add a start prompt.
  if (!focusCategory && !geoFieldsOnly && messages.length === 0) {
    messages.push({
      role: "user",
      content: "Analyze this song and begin the visibility process. Start with the categories you can derive from the lyrics, then interview me for the rest.",
    });
    await supabase.from("song_visibility_messages").insert({
      song_id,
      role: "user",
      content: "Analyze this song and begin the visibility process. Start with the categories you can derive from the lyrics, then interview me for the rest.",
    });
  }

  // Build catalog context with internal paths so Claude can write markdown links.
  const catalogLines = ((catalog || []) as Array<{ title: string; slug: string; song_summary: string | null }>)
    .map((s) => `- "${s.title}" → /music/songs/${s.slug}${s.song_summary ? ` — ${s.song_summary}` : ""}`)
    .join("\n");
  const catalogAlbumLines = ((catalogAlbums || []) as Array<{ title: string; slug: string }>)
    .map((a) => `- "${a.title}" → /music/releases/${a.slug}`)
    .join("\n");
  const catalogArtLines = ((catalogArt || []) as Array<{ title: string; slug: string }>)
    .map((a) => `- "${a.title}" → /art/${a.slug}`)
    .join("\n");

  // Build existing sections context — for verbatim categories surface every
  // collected layer so Claude can paste them, never compose them.
  const interviewCategories = new Set(
    VISIBILITY_CATEGORIES.filter((c) => !c.autoGenerate).map((c) => c.slug)
  );
  const sectionState = (existingSections || [])
    .filter((s: any) => s.content || s.direct_answer || (s.key_points && s.key_points.length > 0))
    .map((s: any) => {
      if (interviewCategories.has(s.category)) {
        const da = s.direct_answer ? `direct-answer: ${s.direct_answer}` : "(no direct-answer collected yet)";
        const pr = s.content ? `prose:\n${s.content}` : "(no prose collected yet)";
        const kp = s.key_points && s.key_points.length > 0
          ? `key-points:\n${s.key_points.map((p: string) => `- ${p}`).join("\n")}`
          : "(no key-points collected yet)";
        return `### ${s.category} (Chad's verbatim layers — paste these into the tags, do NOT edit)\n${da}\n${pr}\n${kp}`;
      }
      return `- ${s.category}: has content (will regenerate)`;
    })
    .join("\n\n") || "None generated yet";

  // Build category definitions
  const categoryDefs = VISIBILITY_CATEGORIES
    .map((c) => {
      const mode = VERBATIM_CATEGORIES.has(c.slug)
        ? "VERBATIM — Chad writes all three layers, you only collect and wrap"
        : c.autoGenerate
          ? "auto-generate from lyrics"
          : "interview Chad";
      return `- **${c.label}** (slug: ${c.slug}): ${c.description} [${mode}]`;
    })
    .join("\n");

  const systemPrompt = `You are Chad Lewine's song visibility strategist. You serve TWO roles depending on the category:

ROLE A — for AUTO-GENERATE categories (Breakdown, Cultural Position, Connections, Sync Placements, Fragments, Hooks): you generate raw marketing material, ideas, and discovery angles. You write all three layers (direct-answer, prose, key-points) yourself, in Chad's voice, subject to the hard constraints below.

ROLE B — for VERBATIM categories (Story, World, Audience): Chad writes every layer himself. You DO NOT compose, summarize, polish, or rewrite. Your job is to (1) ask Chad for each layer in turn, (2) collect his text, (3) wrap his EXACT words in the layer tags. Three prompts per category, one per layer, in this order: direct-answer → prose → key-points. Ask one layer at a time. When all three layers exist (either from this turn or from prior interview context shown in CURRENT STATE), emit the <visibility:slug> block with his text pasted verbatim — no edits, no condensing, no rewording. The hard constraints below apply ONLY to your own writing in Role A.

THE SONG:
Title: ${song.title}
Album: ${album?.title || "Unknown"}
Release Date: ${song.release_date || "Not set"}
Duration: ${song.duration_seconds ? `${Math.floor(song.duration_seconds / 60)}:${String(song.duration_seconds % 60).padStart(2, "0")}` : "Unknown"}
ISRC: ${song.isrc || "Not set"}

Lyrics:
${song.lyrics || "(No lyrics available)"}

Song Summary: ${song.song_summary || "(Not written yet)"}

Existing Citation Summary: ${song.citation_summary || "(None — needs generation)"}
Existing Entity Tags: ${(song.entity_tags && song.entity_tags.length > 0) ? song.entity_tags.join(", ") : "(None — needs generation)"}

${badge ? `RISING COMPASS DATA:
Tier: ${badge.tier_label}
Charge: ${badge.charge}
Charge Summary: ${badge.charge_summary || "None"}
Contaminated: ${badge.contaminated ? `Yes — ${badge.contamination_note}` : "No"}` : "RISING COMPASS: Not classified yet"}

CHAD'S CATALOG — when you reference any of these in prose, format as a markdown link to the path shown:

Songs:
${catalogLines || "No other published songs"}

Albums:
${catalogAlbumLines || "No published albums"}

Art:
${catalogArtLines || "No published art"}

THE VISIBILITY CATEGORIES:
${categoryDefs}

CURRENT STATE:
${sectionState}

GEO FIELDS — ONE-TIME EMIT:
Once per conversation, after the auto-generate categories exist, emit a single <geo-fields> block. This feeds Section 1 of the public landing page ("What Is [Title]?") and is distinct from the per-category format stack. Only emit this block ONCE — if the song already has these (you'll see them in the existing sections summary), do not re-emit.

<geo-fields>
<citation-summary>40-60 word standalone summary of the WHOLE SONG — title, artist (Chad Lewine), what it is musically and thematically, why it exists. Written to be lifted verbatim by an AI engine as the canonical one-paragraph answer. No markdown, no intro, just the summary.</citation-summary>
<entity-tags>
- genre / subgenre
- mood
- theme
- era / scene reference
- instrumentation signature
- lyrical motif
</entity-tags>
</geo-fields>

Entity tags: 4-8 short noun phrases (1-3 words each). Real, searchable entities — not poetic abstractions. Think: "synth-pop", "post-divorce", "Gulf Coast night drive", not "the ache of knowing".

FORMAT STACK — CRITICAL:
Every category must output THREE extraction layers, not just one. AI engines extract differently:
- Perplexity grabs the bullet list
- ChatGPT grabs the narrative
- Gemini grabs the direct answer + schema

When you generate content for a category, use this three-layer delimiter format:

<visibility:breakdown>
<direct-answer>20-30 word standalone summary. Self-contained — an AI reads this back verbatim. No intro, no setup, just the answer.</direct-answer>
<prose>
75-150 words of expanded narrative. USE MARKDOWN: **bold** for emphasis, line breaks between paragraphs, > blockquotes for lyric references. This is the citation-worthy layer — depth, context, specifics. Not a wall of text.
</prose>
<key-points>
- Bullet point 1
- Bullet point 2
- Bullet point 3
</key-points>
</visibility:breakdown>

HARD LIMITS PER LAYER (apply to Role A output; Role B passes Chad's text through unchanged):
- direct-answer: 20-30 words. One block. No markdown.
- prose: 75-150 words. MUST use markdown formatting (bold, paragraphs, blockquotes for lyrics). Not an essay.
- key-points: 3-4 bullets. One line each. No sub-bullets.
- Total per category: under 250 words across all three layers combined.

All three sub-layers are required for every category. The direct-answer is a self-contained block (not an intro to the prose). The prose expands with depth. The key-points are a structured summary of the same content, not new content.

VOICE — CRITICAL:
All output (direct-answer, prose, key-points) is PUBLIC-FACING and appears on the song's landing page. NEVER use admin- or SEO-facing vocabulary in any layer. Forbidden: "searcher", "searchers", "seeker", "seekers", "audience segment", "target query", "SEO", "GEO", "intent", "keyphrase", "ranking", "surface", "pickup", "extraction", "discovery angle", "funnel", "interception". If you need to describe the reader, use natural human terms ("listeners", "anyone who", "you", "people who feel X") or just speak about the song itself. The HOOKS category is the ONE EXCEPTION — it's internal/admin-only, so query phrases and admin language are fine there. Every sentence in every other category must read like it was written for a human visitor, not a growth strategist.

BEHAVIOR:
1. AUTO-GENERATE categories (Role A): analyze the lyrics and generate raw content immediately with all three layers. These don't need Chad's input. Generate them in this order: Hooks, Breakdown, Fragments, Cultural Position, Connections, Sync Placements.
2. VERBATIM categories — Story, World, Audience (Role B): walk Chad through three prompts per category (direct-answer → prose → key-points). Ask ONE layer at a time. After his reply, ask for the next layer. When all three are collected (either this turn or in CURRENT STATE), emit the <visibility:slug> block with his text pasted EXACTLY into the layer tags. NEVER edit, polish, condense, rephrase, or compose. If a layer is too long or too short for the limits, do not silently trim — tell Chad and ask him to rewrite. Only Chad's words go into Story / World / Audience.
3. Every Role A idea should be something Chad can act on. No filler.
4. For Fragments, extract specific quotable lines from the lyrics with brief context on why each one works.
5. For Hooks, think about what someone would ask an AI or search engine that this song answers.
6. For Connections, reference specific other songs from the catalog.
7. For Cultural Position: this is PUBLIC-FACING content, not internal strategy. Write it as what the song reflects about where culture is right now. The seeker reads this and recognizes their own world. Not "here are editorial angles to pursue" — instead "here is what this song says about what people are living through." Frame it as cultural commentary, not marketing positioning.
8. For Sync Placements, propose concrete placement scenarios where this song would land — film, TV, trailer, ad, game, or platform contexts. Derive the mood, pacing, and thematic shape from the lyrics and (if present) The World / The Story content; then imagine specific scenes the song could score. Each layer must read as natural editorial prose, not as a pitch deck:
   - direct-answer: one self-contained paragraph naming 2–3 strongest placement types in plain language (e.g. "End-credits of a coming-of-age indie film, the climactic driving-away shot of a reflective streaming drama, or a lifestyle brand spot leaning into late-summer nostalgia").
   - prose: expand on the scene-shapes this song fits — pacing, emotional arc, what the visuals are doing while it plays, what kind of story it ends or opens. Reference specific reference films, shows, or ads when it sharpens the picture. Use markdown.
   - key-points: 5–7 bullets, each a single concrete placement scenario written as a searchable phrase. Shape them like things a music supervisor or director would type into a search bar: "End-credits song for a coming-of-age indie film", "Montage in a reflective streaming drama about family", "Trailer bed for a quiet sci-fi feature about memory", "Late-summer nostalgia spot for a lifestyle brand". Concrete genre + visual context + platform. No fluff, no "perfect for…" phrasing.

INTERNAL LINKS:
When the prose layer mentions any of Chad's other songs, albums, or art (especially in the Connections / Other Songs section), use markdown link syntax with the EXACT path from the catalog above. Example: \`[Hyperising](/music/songs/hyperising)\`. Never invent slugs. Never link out to streaming platforms here — internal site links only. The Connections section in particular should link generously to the catalog.

${voiceProfile ? `VOICE PROFILE — write IN this voice (Role A only; Role B passes Chad's text through):
${voiceProfile}

In Role A categories, the direct-answer, prose, and key-points layers must all sound like Chad wrote them. Use his cadence, his phrasing, his metaphors, his tics. If a line drifts toward generic-blog or marketing-speak, rewrite it until it sounds like Chad. The Hooks category is the one place admin/SEO vocabulary is allowed; every other Role A category must read like Chad's own words.` : "(No voice profile saved yet — match the cadence in the lyrics and song summary above.)"}${geoFieldsOnly ? `

GEO-ONLY MODE:
On this turn output ONLY one <geo-fields> block. No <visibility:...> categories. No narration. The block must contain a <citation-summary> (40-60 words about the WHOLE song) and an <entity-tags> list (4-8 short noun phrases — real, searchable entities like "synth-pop", "post-divorce", "Gulf Coast night drive"; not poetic abstractions).` : ""}${focusCategory ? `

FOCUS MODE:
On this turn emit ONLY the <visibility:${focusCategory.slug}> block for "${focusCategory.label}"${needsGeoFieldsHint(song) ? ", PLUS one <geo-fields> block (the song is missing citation_summary or entity_tags — emitting them is REQUIRED on this turn)" : " (do not emit <geo-fields> — the song already has them)"}. Do not emit any other category, do not narrate, do not interview${VERBATIM_CATEGORIES.has(focusCategory.slug) ? " — paste Chad's verbatim text from CURRENT STATE into the layer tags exactly as he wrote it" : ""}. Output the format stack and stop.` : ""}

═══════════════════════════════════════════════════════════════════════
HARD CONSTRAINTS — these override everything above when in conflict.
Pulled from the Voice Profile § V "Language Rules (Hard Constraints)".
The voice profile is too long to retain through generation; these are
the bright-line rules that must be re-checked sentence-by-sentence as
you write. If a sentence violates one, REWRITE before emitting.
APPLIES TO ROLE A ONLY — Chad's verbatim text in Role B is never edited.
═══════════════════════════════════════════════════════════════════════

NEVER WRITE THESE PHRASES (AI tells, every one is auto-flagged):
  • "operates in that same territory" / "carries that same energy" — connector clichés
  • "in today's [X]" / "when it comes to [X]" — throat-clearing openers
  • "Moreover" / "Furthermore" / "Additionally" / "That said" / "With that in mind" — connector crutches
  • "Not only X, but also Y" — AI structural tell
  • "Whether you're looking for X or Y" / "Whether it's X, Y, or Z" — AI pattern
  • "From X to Y" ranges (used to sound comprehensive) — fake specificity
  • "The right [noun]" ("the right partner," "the right solution") — filler
  • "Imagine this:" / "Picture this:" / "Here's the thing" — AI openers
  • "It's worth noting that" / "It's important to note" — hedging filler
  • "At the end of the day" / "Bottom line" / "In short" / "Simply put" / "In conclusion" — summary crutches
  • "Truly" / "Really" / "Incredibly" / "Absolutely" — empty intensifiers
  • "Peace of mind" / "Game-changer" / "Cutting-edge" / "Next-level" / "World-class" / "Seamless" / "Streamlined" / "Hassle-free" — hype clichés
  • "the rare thing of [verbing]" / "the specific texture of [noun]" — generic music-critic phrasing
  • "meets the listener wherever they are" / "speaks directly to" / "feel this song in their chest" — review-cliché
  • "the algorithm and the audience couldn't tell the difference" / similar press-release summary lines

WORDS CHAD NEVER USES (in any non-Hooks section):
  • "Content" (for his own work) — say "music," "art," "songs," "the work"
  • "Brand" (for himself), "Thought leader"
  • "Solutions" / "leverage" / "synergy"
  • "Journey" (as spiritual cliché)
  • "Manifest" (as TikTok trend vocabulary; "manifestation" in original spiritual sense is OK)

STRUCTURAL TELLS (auto-flag and rewrite):
  • Three short punchy sentences in a row. ("He doesn't write. He doesn't target. He transmits." → that's three. Cut to two or four.)
  • Three parallel "and" or "or" items in a list, or a list of exactly three items.
  • Bolding the first sentence of every paragraph.
  • Three medium-length sentences in a row without variation.
  • Symmetry-flexing pairs ("from descent to ascent", "from confrontation to transcendence", "the disease and the cure", "the sickness and the way out") — pick one or rewrite.
  • Ending sections with a rhetorical question for fake engagement.
  • Starting consecutive paragraphs with the same word.

POSITIVE RULES:
  • Open with the action or the thesis. First sentence IS the point. No throat-clearing.
  • If a sentence could appear in any music writer's copy with zero changes, it's too generic. Rewrite it.
  • Ground in lived, specific evidence (specific track titles, specific dollar amounts, specific dates, specific lyric quotes) BEFORE elevating to philosophy.
  • Name the specific adversary explicitly ("the technocracy," "the algorithm," "Spotify," "the comments section"), never vaguely.
  • End with a declaration or a question-as-challenge, never a recap or summary.
  • No emdashes. Use commas, parentheses, or sentence breaks.
  • No "you"/"we" switching mid-paragraph.

SELF-CHECK BEFORE EMITTING:
After drafting each Role A layer (direct-answer, prose, key-points), scan it once against this list. If you spot any item, rewrite that sentence before closing the block. The first draft is allowed to drift; the emitted block is not.${focusCategory ? `

You are emitting ONLY <visibility:${focusCategory.slug}>. ${VERBATIM_CATEGORIES.has(focusCategory.slug) ? "This is a Role B (verbatim) category — paste Chad's words from CURRENT STATE; the self-check does not apply because his text is never edited." : "Run the self-check on every sentence before you close the block."}` : ""}`;

  // Call Claude API with streaming
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "prompt-caching-2024-07-31",
    },
    body: JSON.stringify({
      model: "claude-opus-4-7",
      max_tokens: 4096,
      stream: true,
      system: [
        {
          type: "text",
          text: systemPrompt,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("Claude API error:", errText);
    return Response.json({ error: "Claude API request failed" }, { status: 502 });
  }

  // Stream the response through to the client, accumulating full text
  let fullText = "";
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async start(controller) {
      const reader = res.body!.getReader();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const payload = line.slice(6).trim();
            if (payload === "[DONE]") continue;

            try {
              const event = JSON.parse(payload);
              if (event.type === "content_block_delta" && event.delta?.text) {
                fullText += event.delta.text;
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`));
              }
            } catch {
              // skip unparseable lines
            }
          }
        }

        // Stream complete — save assistant message (skip for per-section regen
        // and geo-only regen so the interview thread stays clean).
        if (!focusCategory && !geoFieldsOnly) {
          await supabase.from("song_visibility_messages").insert({
            song_id,
            role: "assistant",
            content: fullText,
          });
        }

        // Parse <visibility:slug> delimiters and extract three-layer format stack
        const sectionRegex = /<visibility:([a-z-]+)>([\s\S]*?)<\/visibility:\1>/g;
        let match;
        while ((match = sectionRegex.exec(fullText)) !== null) {
          const [, category, rawContent] = match;
          const validCategory = VISIBILITY_CATEGORIES.find((c) => c.slug === category);
          if (!validCategory) continue;

          // Extract format stack layers
          const daMatch = rawContent.match(/<direct-answer>([\s\S]*?)<\/direct-answer>/);
          const proseMatch = rawContent.match(/<prose>([\s\S]*?)<\/prose>/);
          const kpMatch = rawContent.match(/<key-points>([\s\S]*?)<\/key-points>/);

          const directAnswer = daMatch ? daMatch[1].trim() : null;
          const prose = proseMatch ? proseMatch[1].trim() : rawContent.trim();
          const keyPoints = kpMatch
            ? kpMatch[1].trim().split(/\n/).map((l: string) => l.replace(/^[-*]\s*/, "").trim()).filter(Boolean)
            : [];

          await supabase.from("song_visibility_sections").upsert(
            {
              song_id,
              category,
              content: prose,
              direct_answer: directAnswer,
              key_points: keyPoints,
              status: "published",
            },
            { onConflict: "song_id,category" }
          );
        }

        // Parse one-time <geo-fields> block and persist to songs row
        const geoMatch = fullText.match(/<geo-fields>([\s\S]*?)<\/geo-fields>/);
        if (geoMatch) {
          const geoRaw = geoMatch[1];
          const csMatch = geoRaw.match(/<citation-summary>([\s\S]*?)<\/citation-summary>/);
          const etMatch = geoRaw.match(/<entity-tags>([\s\S]*?)<\/entity-tags>/);
          const citationSummary = csMatch ? csMatch[1].trim() : null;
          const entityTags = etMatch
            ? etMatch[1]
                .trim()
                .split(/\n/)
                .map((l: string) => l.replace(/^[-*]\s*/, "").trim())
                .filter(Boolean)
            : null;

          const patch: Record<string, unknown> = {};
          if (citationSummary) patch.citation_summary = citationSummary;
          if (entityTags && entityTags.length > 0) patch.entity_tags = entityTags;
          if (Object.keys(patch).length > 0) {
            await supabase.from("songs").update(patch).eq("id", song_id);
          }
        }

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
        controller.close();
      } catch (err) {
        console.error("Stream error:", err);
        controller.error(err);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

async function regenerateGeoFields(
  songId: string,
  apiKey: string,
  supabase: ReturnType<typeof createAdminClient>,
) {
  const { data: song } = await supabase.from("songs").select("*").eq("id", songId).single();
  if (!song) return Response.json({ error: "Song not found" }, { status: 404 });

  const { data: vpRow } = await supabase.from("voice_profile").select("content").limit(1).single();
  const voiceProfile = vpRow?.content || "";

  // Pull any published visibility-section content as extra grounding.
  const { data: sectionsData } = await supabase
    .from("song_visibility_sections")
    .select("category, content, direct_answer")
    .eq("song_id", songId);
  const sectionsContext = (sectionsData || [])
    .filter((s) => s.content || s.direct_answer)
    .map((s) => `### ${s.category}\n${s.direct_answer || ""}\n${s.content || ""}`)
    .join("\n\n");

  const systemPrompt = `You are writing the public "About / Topics & themes" panel for a Chad Lewine song. Output ONLY one <geo-fields> block — no other text, no preamble, no markdown code fences.

THE SONG:
Title: ${song.title}
Lyrics:
${song.lyrics || "(No lyrics available)"}

Song Summary: ${song.song_summary || "(Not written yet)"}

${sectionsContext ? `EXISTING VISIBILITY SECTIONS (use as truth):
${sectionsContext}` : ""}

${voiceProfile ? `VOICE PROFILE — write IN this voice:
${voiceProfile}` : ""}

REQUIRED OUTPUT — exactly this shape, nothing else:

<geo-fields>
<citation-summary>Standalone summary of the WHOLE SONG (title, artist Chad Lewine, what it is musically and thematically, why it exists). Plain text, no markdown, lifted verbatim by AI engines.

HARD CONSTRAINTS — these are not suggestions:
- 30 to 45 words.
- Must end on a complete sentence with a period.
- Must NOT end with "..." or "…" or a trailing fragment.
- Self-contained. No "this song", "this track", "the listener" — name the song and what it does directly.</citation-summary>
<entity-tags>
- 4-8 short noun phrases (1-3 words each)
- Real, searchable entities — "synth-pop", "post-divorce", "Gulf Coast night drive"
- Not poetic abstractions — never "the ache of knowing"
</entity-tags>
</geo-fields>`;

  const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-opus-4-7",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: "Emit the <geo-fields> block now." }],
    }),
  });

  if (!apiRes.ok) {
    const errText = await apiRes.text();
    console.error("[geoOnly] Claude API error:", errText);
    return Response.json({ error: "Claude API request failed" }, { status: 502 });
  }

  const json = await apiRes.json();
  const fullText: string = json.content?.[0]?.text || "";
  console.log("[geoOnly] Claude output:\n" + fullText);

  const geoMatch = fullText.match(/<geo-fields>([\s\S]*?)<\/geo-fields>/);
  if (!geoMatch) {
    console.error("[geoOnly] No <geo-fields> block found. Raw:", fullText);
    return Response.json(
      { error: "Claude did not emit a <geo-fields> block", raw: fullText },
      { status: 502 },
    );
  }

  const geoRaw = geoMatch[1];
  const csMatch = geoRaw.match(/<citation-summary>([\s\S]*?)<\/citation-summary>/);
  const etMatch = geoRaw.match(/<entity-tags>([\s\S]*?)<\/entity-tags>/);
  const citationSummary = csMatch ? csMatch[1].trim() : null;
  const entityTags = etMatch
    ? etMatch[1]
        .trim()
        .split(/\n/)
        .map((l: string) => l.replace(/^[-*]\s*/, "").trim())
        .filter(Boolean)
    : null;

  if (!citationSummary && (!entityTags || entityTags.length === 0)) {
    return Response.json(
      { error: "Parsed <geo-fields> but neither citation-summary nor entity-tags came through", raw: fullText },
      { status: 502 },
    );
  }

  // Write each field independently so a length error on one doesn't lose the
  // other. Track per-field success so we can return a clear status.
  const writeErrors: string[] = [];
  let citationWritten = false;
  let tagsWritten = false;

  if (citationSummary) {
    const { error } = await supabase
      .from("songs")
      .update({ citation_summary: citationSummary })
      .eq("id", songId);
    if (error) {
      console.error("[geoOnly] citation_summary write failed:", error.message);
      writeErrors.push(`citation_summary: ${error.message}`);
    } else {
      citationWritten = true;
    }
  }

  if (entityTags && entityTags.length > 0) {
    const { error } = await supabase
      .from("songs")
      .update({ entity_tags: entityTags })
      .eq("id", songId);
    if (error) {
      console.error("[geoOnly] entity_tags write failed:", error.message);
      writeErrors.push(`entity_tags: ${error.message}`);
    } else {
      tagsWritten = true;
    }
  }

  if (!citationWritten && !tagsWritten) {
    return Response.json(
      { error: writeErrors.join(" · ") || "Both fields failed to write", raw: fullText },
      { status: 500 },
    );
  }

  return Response.json({
    ok: true,
    citation_summary: citationWritten ? citationSummary : null,
    entity_tags: tagsWritten ? entityTags : null,
    partial: writeErrors.length > 0 ? writeErrors.join(" · ") : null,
    raw: writeErrors.length > 0 ? fullText : undefined,
  });
}
