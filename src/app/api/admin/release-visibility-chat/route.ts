import { createAdminClient } from "@/lib/supabase-server";
import { RELEASE_VISIBILITY_CATEGORIES } from "@/lib/release-visibility";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Three categories whose layers are written verbatim by Chad — never composed
// by Claude. The chat collects each layer in three prompts, then emits the
// <visibility:slug> block with Chad's text pasted unchanged into the tags.
const VERBATIM_CATEGORIES = new Set(["story", "world", "audience"]);

async function resolveAlbumId(
  supabase: ReturnType<typeof createAdminClient>,
  idOrSlug: string,
): Promise<string | null> {
  if (UUID_RE.test(idOrSlug)) return idOrSlug;
  const { data } = await supabase.from("releases").select("id").eq("slug", idOrSlug).maybeSingle();
  return data?.id ?? null;
}

function needsAlbumGeoFieldsHint(album: { citation_summary?: string | null; entity_tags?: unknown }): boolean {
  const tags = Array.isArray(album.entity_tags) ? album.entity_tags : [];
  return !album.citation_summary || tags.length === 0;
}

export async function POST(request: Request) {
  const { release_id: albumIdOrSlug, message, category, geoOnly } = await request.json();
  if (!albumIdOrSlug) return Response.json({ error: "album_id required" }, { status: 400 });

  // Per-section regen is only valid for narrative categories.
  const focusCategory = category
    ? RELEASE_VISIBILITY_CATEGORIES.find((c) => c.slug === category && c.kind === "narrative") || null
    : null;
  if (category && !focusCategory) {
    return Response.json({ error: "unknown or non-narrative category" }, { status: 400 });
  }
  const geoFieldsOnly = !!geoOnly;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });

  const supabase = createAdminClient();

  const release_id = await resolveAlbumId(supabase, albumIdOrSlug);
  if (!release_id) return Response.json({ error: "Album not found" }, { status: 404 });

  // Geo-only path: focused, non-streaming regen for the public About panel.
  if (geoFieldsOnly) {
    return regenerateAlbumGeoFields(release_id, apiKey, supabase);
  }

  // Load context: album, tracklist, voice profile, catalog, history, sections.
  const [
    { data: album },
    { data: junctions },
    { data: vpRow },
    { data: catalogAlbums },
    { data: catalogArt },
    { data: history },
    { data: existingSections },
  ] = await Promise.all([
    supabase.from("releases").select("*").eq("id", release_id).single(),
    supabase
      .from("release_songs")
      .select("track_number, song:songs(id, title, slug, lyrics, song_summary)")
      .eq("release_id", release_id)
      .order("track_number"),
    supabase.from("voice_profile").select("content").limit(1).single(),
    supabase
      .from("releases")
      .select("id, title, slug")
      .neq("id", release_id)
      .eq("status", "published"),
    supabase
      .from("art_pieces")
      .select("id, title, slug")
      .in("status", ["unreleased", "published"]),
    supabase.from("release_visibility_messages")
      .select("*")
      .eq("release_id", release_id)
      .order("created_at"),
    supabase.from("release_visibility_sections")
      .select("category, content, direct_answer, key_points")
      .eq("release_id", release_id),
  ]);

  if (!album) return Response.json({ error: "Album not found" }, { status: 404 });

  const voiceProfile = vpRow?.content || "";

  type SongLite = { id: string; title: string; slug: string; lyrics: string | null; song_summary: string | null };
  const tracklist = ((junctions || []) as unknown as Array<{
    track_number: number;
    song: SongLite | SongLite[] | null;
  }>)
    .map((j) => {
      const s = Array.isArray(j.song) ? j.song[0] : j.song;
      return s ? { ...s, track_number: j.track_number } : null;
    })
    .filter(Boolean) as Array<{ id: string; title: string; slug: string; lyrics: string | null; song_summary: string | null; track_number: number }>;

  // Save user message if this is part of the interview thread (not focused regen).
  if (message && !focusCategory) {
    await supabase.from("release_visibility_messages").insert({
      release_id,
      role: "user",
      content: message,
    });
  }

  // Build conversation messages.
  let messages: Array<{ role: "user" | "assistant"; content: string }>;
  if (focusCategory) {
    const isVerbatim = VERBATIM_CATEGORIES.has(focusCategory.slug);
    messages = [
      {
        role: "user",
        content: isVerbatim
          ? `Re-emit the <visibility:${focusCategory.slug}> block for "${focusCategory.label}" using Chad's verbatim text from the prior interview shown in CURRENT STATE above. Paste his exact direct-answer, prose, and key-points into the layer tags — DO NOT rewrite, polish, summarize, or compose. If any of the three layers is missing from prior context, ask Chad for it instead of making one up.`
          : `Generate the "${focusCategory.label}" section ONLY. Use the voice profile, the tracklist + lyrics, and any prior interview context. Output exactly one <visibility:${focusCategory.slug}> block with the full format stack — no other categories on this turn.`,
      },
    ];
  } else {
    type HistoryRow = { role: string; content: string };
    messages = ((history || []) as HistoryRow[]).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));
  }

  if (!focusCategory && message) {
    messages.push({ role: "user", content: message });
  }

  if (!focusCategory && messages.length === 0) {
    messages.push({
      role: "user",
      content: "Analyze this album and begin the visibility process. Auto-generate categories you can derive from the tracklist + lyrics, then walk me through the verbatim-write categories one layer at a time.",
    });
    await supabase.from("release_visibility_messages").insert({
      release_id,
      role: "user",
      content: "Analyze this album and begin the visibility process. Auto-generate categories you can derive from the tracklist + lyrics, then walk me through the verbatim-write categories one layer at a time.",
    });
  }

  // Catalog context for internal links.
  const catalogAlbumLines = ((catalogAlbums || []) as Array<{ title: string; slug: string }>)
    .map((a) => `- "${a.title}" → /music/releases/${a.slug}`)
    .join("\n");
  const catalogArtLines = ((catalogArt || []) as Array<{ title: string; slug: string }>)
    .map((a) => `- "${a.title}" → /art/${a.slug}`)
    .join("\n");
  const trackLines = tracklist
    .map((t) => `- ${String(t.track_number).padStart(2, "0")} "${t.title}" → /music/songs/${t.slug}${t.song_summary ? ` — ${t.song_summary}` : ""}`)
    .join("\n");
  const lyricsBlock = tracklist
    .map((t) => `### ${t.track_number}. ${t.title}\n${t.lyrics || "(no lyrics on file)"}`)
    .join("\n\n");

  // Existing sections context — narrative interview categories surface their
  // collected layers verbatim so Claude can wrap them, never compose them.
  const interviewCategories = new Set(
    RELEASE_VISIBILITY_CATEGORIES.filter((c) => c.kind === "narrative" && !c.autoGenerate).map((c) => c.slug),
  );
  type ExistingSection = {
    category: string;
    content: string | null;
    direct_answer: string | null;
    key_points: string[] | null;
  };
  const sectionState = ((existingSections || []) as ExistingSection[])
    .filter((s) => s.content || s.direct_answer || (s.key_points && s.key_points.length > 0))
    .map((s) => {
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

  const categoryDefs = RELEASE_VISIBILITY_CATEGORIES
    .filter((c) => c.kind === "narrative")
    .map((c) => {
      const mode = VERBATIM_CATEGORIES.has(c.slug)
        ? "VERBATIM — Chad writes all three layers, you only collect and wrap"
        : c.autoGenerate
          ? "auto-generate from tracklist+lyrics"
          : "interview Chad";
      return `- **${c.label}** (slug: ${c.slug}): ${c.description} [${mode}]`;
    })
    .join("\n");

  const systemPrompt = `You are Chad Lewine's album visibility strategist. You serve TWO roles depending on the category:

ROLE A — for AUTO-GENERATE categories (Breakdown, Cultural Position, If You Like, Connections, Sync Placements, Fragments, Hooks): you generate raw marketing material, ideas, and discovery angles. You write all three layers (direct-answer, prose, key-points) yourself, in Chad's voice, subject to the hard constraints below.

ROLE B — for VERBATIM categories (Story, World, Audience): Chad writes every layer himself. You DO NOT compose, summarize, polish, or rewrite. Your job is to (1) ask Chad for each layer in turn, (2) collect his text, (3) wrap his EXACT words in the layer tags. Three prompts per category, one per layer, in this order: direct-answer → prose → key-points. Ask one layer at a time. When all three layers exist (either from this turn or from prior interview context shown in CURRENT STATE), emit the <visibility:slug> block with his text pasted verbatim — no edits, no condensing, no rewording. The hard constraints below apply ONLY to your own writing in Role A.

THE ALBUM:
Title: ${album.title}
Slug: ${album.slug}
Release Date: ${album.release_date || "Not set"}
Concept (Chad's manifesto for this album — not yours to rewrite, only to use as ground truth):
${album.concept_statement || "(not yet written)"}

TRACKLIST:
${trackLines || "(no songs on this album yet)"}

ALL LYRICS (whole album):
${lyricsBlock || "(no lyrics on file for any track)"}

CHAD'S CATALOG — when you reference any of these in prose, format as a markdown link to the path shown:

Albums:
${catalogAlbumLines || "No other published albums"}

Art:
${catalogArtLines || "No published art"}

THE VISIBILITY CATEGORIES (narrative only — data categories like Lyrics/Art/Video/Merch/etc are curated by hand, not by you):
${categoryDefs}

CURRENT STATE:
${sectionState}

GEO FIELDS — ONE-TIME EMIT:
Once per conversation, after the auto-generate categories exist, emit a single <geo-fields> block. This feeds the public "About / Topics & themes" panel on the album page and is distinct from the per-category format stack. Only emit ONCE — if the album already has these (you'll see the existing values listed above), do not re-emit.

<geo-fields>
<citation-summary>30-45 word standalone summary of the WHOLE ALBUM — title, artist (Chad Lewine), what it is musically and thematically, why it exists. Written to be lifted verbatim by an AI engine as the canonical one-paragraph answer. Plain text, no markdown, ends on a complete sentence with a period. Self-contained — name the album directly, no "this album" / "the listener".</citation-summary>
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

Existing geo fields on this album:
- citation_summary: ${album.citation_summary || "(none)"}
- entity_tags: ${(Array.isArray(album.entity_tags) && album.entity_tags.length > 0) ? album.entity_tags.join(", ") : "(none)"}

FORMAT STACK — CRITICAL:
Every visibility category outputs THREE extraction layers. AI engines extract differently:
- Perplexity grabs the bullet list
- ChatGPT grabs the narrative
- Gemini grabs the direct answer

Format:

<visibility:breakdown>
<direct-answer>20-30 word standalone summary. Self-contained — an AI reads this back verbatim. No intro, no setup, just the answer.</direct-answer>
<prose>
75-150 words of expanded narrative. USE MARKDOWN: **bold** for emphasis, line breaks between paragraphs, > blockquotes for lyric references. This is the citation-worthy layer.
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

VOICE — CRITICAL:
All output (direct-answer, prose, key-points) is PUBLIC-FACING and appears on the album's landing page. NEVER use admin- or SEO-facing vocabulary in any layer. Forbidden: "searcher", "searchers", "seeker", "seekers", "audience segment", "target query", "SEO", "GEO", "intent", "keyphrase", "ranking", "surface", "pickup", "extraction", "discovery angle", "funnel", "interception". The HOOKS category is the ONE EXCEPTION — it's internal/admin-only, so query phrases and admin language are fine there.

BEHAVIOR:
1. CONCEPT IS OFF-LIMITS. Chad writes the Concept manifesto by hand. Use it above as ground truth — never propose a new one, never rewrite it, never emit a <visibility:concept> block.
2. AUTO-GENERATE categories (Breakdown, Cultural Position, If You Like, Connections, Sync Placements, Fragments, Hooks): analyze the tracklist + lyrics and generate raw content immediately with all three layers, in Chad's voice, subject to the hard constraints below.
3. VERBATIM categories (Story, World, Audience): walk Chad through three prompts per category (direct-answer → prose → key-points). Ask ONE layer at a time. After his reply, ask for the next layer. When all three are collected (either this turn or in CURRENT STATE), emit the <visibility:slug> block with his text pasted EXACTLY into the layer tags. NEVER edit, polish, condense, rephrase, or compose. If a layer is too long or too short for the limits, do not silently trim — tell Chad and ask him to rewrite. Only Chad's words go into Story / World / Audience.
4. For Connections, reference specific other albums and tracks from the catalog with internal markdown links.
5. For Fragments, extract specific quotable lines from across the album with brief context for each.
6. For If You Like, name specific famous artists and albums whose fans would genuinely connect.
7. For Sync Placements, propose concrete placement scenarios (film/TV/trailer/ad/game) and write key-points as searchable phrases a music supervisor would type.

INTERNAL LINKS:
When the prose layer mentions any of Chad's other songs, albums, or art, use markdown link syntax with EXACT paths from the catalog above. Never invent slugs.

${voiceProfile ? `VOICE PROFILE — write IN this voice (Role A only; Role B passes Chad's text through):
${voiceProfile}

In Role A categories, the direct-answer, prose, and key-points layers must all sound like Chad wrote them. The Hooks category is the one place admin/SEO vocabulary is allowed; every other Role A category must read like Chad's own words.` : "(No voice profile saved yet — match the cadence in Chad's existing prose above.)"}${focusCategory ? `

FOCUS MODE:
On this turn emit ONLY the <visibility:${focusCategory.slug}> block for "${focusCategory.label}"${needsAlbumGeoFieldsHint(album) ? ", PLUS one <geo-fields> block (the album is missing citation_summary or entity_tags — emitting them is REQUIRED on this turn)" : " (do not emit <geo-fields> — the album already has them)"}. Do not emit any other category, do not narrate, do not interview${VERBATIM_CATEGORIES.has(focusCategory.slug) ? " — paste Chad's verbatim text from CURRENT STATE into the layer tags exactly as he wrote it" : ""}. Output the format stack and stop.` : ""}

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
  • "meets the listener wherever they are" / "speaks directly to" / "feel this album in their chest" — review-cliché
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

  const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "prompt-caching-2024-07-31",
    },
    body: JSON.stringify({
      model: "claude-opus-4-7",
      max_tokens: 2048,
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

  if (!apiRes.ok) {
    const errText = await apiRes.text();
    console.error("Claude API error:", errText);
    return Response.json({ error: "Claude API request failed" }, { status: 502 });
  }

  let fullText = "";
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async start(controller) {
      const reader = apiRes.body!.getReader();
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
              // skip
            }
          }
        }

        // Save assistant message for the interview thread (not for focus regen).
        if (!focusCategory) {
          await supabase.from("release_visibility_messages").insert({
            release_id,
            role: "assistant",
            content: fullText,
          });
        }

        // Parse <visibility:slug> delimiters and persist as published rows.
        const sectionRegex = /<visibility:([a-z-]+)>([\s\S]*?)<\/visibility:\1>/g;
        let match;
        while ((match = sectionRegex.exec(fullText)) !== null) {
          const [, cat, rawContent] = match;
          const valid = RELEASE_VISIBILITY_CATEGORIES.find((c) => c.slug === cat && c.kind === "narrative");
          if (!valid) continue;

          const daMatch = rawContent.match(/<direct-answer>([\s\S]*?)<\/direct-answer>/);
          const proseMatch = rawContent.match(/<prose>([\s\S]*?)<\/prose>/);
          const kpMatch = rawContent.match(/<key-points>([\s\S]*?)<\/key-points>/);

          const directAnswer = daMatch ? daMatch[1].trim() : null;
          const prose = proseMatch ? proseMatch[1].trim() : rawContent.trim();
          const keyPoints = kpMatch
            ? kpMatch[1].trim().split(/\n/).map((l: string) => l.replace(/^[-*]\s*/, "").trim()).filter(Boolean)
            : [];

          // Preserve existing status when regenerating — don't yank a
          // published row back to draft just because the content changed.
          const { data: existing } = await supabase
            .from("release_visibility_sections")
            .select("status")
            .eq("release_id", release_id)
            .eq("category", cat)
            .maybeSingle();
          const nextStatus = existing?.status || "draft";

          await supabase.from("release_visibility_sections").upsert(
            {
              release_id,
              category: cat,
              content: prose,
              direct_answer: directAnswer,
              key_points: keyPoints,
              status: nextStatus,
            },
            { onConflict: "release_id,category" },
          );
        }

        // One-time <geo-fields> block: persist citation_summary + entity_tags
        // to the albums row. Only writes fields that came through.
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
            await supabase.from("releases").update(patch).eq("id", release_id);
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

async function regenerateAlbumGeoFields(
  albumId: string,
  apiKey: string,
  supabase: ReturnType<typeof createAdminClient>,
) {
  const { data: album } = await supabase.from("releases").select("*").eq("id", albumId).single();
  if (!album) return Response.json({ error: "Album not found" }, { status: 404 });

  const { data: junctions } = await supabase
    .from("release_songs")
    .select("track_number, song:songs(title, lyrics, song_summary)")
    .eq("release_id", albumId)
    .order("track_number");
  type TrackLineSong = { title: string; lyrics: string | null; song_summary: string | null };
  type TrackLineRow = { track_number: number; song: TrackLineSong | TrackLineSong[] | null };
  const trackLines = ((junctions || []) as TrackLineRow[])
    .map((j) => {
      const s = Array.isArray(j.song) ? j.song[0] : j.song;
      if (!s) return null;
      return `${j.track_number}. "${s.title}"${s.song_summary ? ` — ${s.song_summary}` : ""}`;
    })
    .filter(Boolean)
    .join("\n");

  const { data: vpRow } = await supabase.from("voice_profile").select("content").limit(1).single();
  const voiceProfile = vpRow?.content || "";

  // Pull any published visibility-section content as extra grounding.
  const { data: sectionsData } = await supabase
    .from("release_visibility_sections")
    .select("category, content, direct_answer")
    .eq("release_id", albumId);
  const sectionsContext = (sectionsData || [])
    .filter((s) => s.content || s.direct_answer)
    .map((s) => `### ${s.category}\n${s.direct_answer || ""}\n${s.content || ""}`)
    .join("\n\n");

  const systemPrompt = `You are writing the public "About / Topics & themes" panel for a Chad Lewine album. Output ONLY one <geo-fields> block — no other text, no preamble, no markdown code fences.

THE ALBUM:
Title: ${album.title}
Concept: ${album.concept_statement || "(not yet written)"}

Tracklist:
${trackLines || "(no tracks yet)"}

${sectionsContext ? `EXISTING VISIBILITY SECTIONS (use as truth):
${sectionsContext}` : ""}

${voiceProfile ? `VOICE PROFILE — write IN this voice:
${voiceProfile}` : ""}

REQUIRED OUTPUT — exactly this shape, nothing else:

<geo-fields>
<citation-summary>Standalone summary of the WHOLE ALBUM (title, artist Chad Lewine, what it is musically and thematically, why it exists). Plain text, no markdown, lifted verbatim by AI engines.

HARD CONSTRAINTS — these are not suggestions:
- 30 to 45 words.
- Must end on a complete sentence with a period.
- Must NOT end with "..." or "…" or a trailing fragment.
- Self-contained. No "this album", "this record", "the listener" — name the album and what it does directly.</citation-summary>
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
    console.error("[album geoOnly] Claude API error:", errText);
    return Response.json({ error: "Claude API request failed" }, { status: 502 });
  }

  const json = await apiRes.json();
  const fullText: string = json.content?.[0]?.text || "";
  console.log("[album geoOnly] Claude output:\n" + fullText);

  const geoMatch = fullText.match(/<geo-fields>([\s\S]*?)<\/geo-fields>/);
  if (!geoMatch) {
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
      .from("releases")
      .update({ citation_summary: citationSummary })
      .eq("id", albumId);
    if (error) {
      console.error("[album geoOnly] citation_summary write failed:", error.message);
      writeErrors.push(`citation_summary: ${error.message}`);
    } else {
      citationWritten = true;
    }
  }

  if (entityTags && entityTags.length > 0) {
    const { error } = await supabase
      .from("releases")
      .update({ entity_tags: entityTags })
      .eq("id", albumId);
    if (error) {
      console.error("[album geoOnly] entity_tags write failed:", error.message);
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
