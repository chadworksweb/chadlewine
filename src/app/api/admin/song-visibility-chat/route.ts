import { createAdminClient } from "@/lib/supabase-server";
import { fetchBadge } from "@/lib/rising-compass";
import { VISIBILITY_CATEGORIES } from "@/lib/song-visibility";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    supabase.from("album_songs")
      .select("track_number, album:albums(id, title, slug)")
      .eq("song_id", song_id)
      .single(),
    supabase.from("voice_profile").select("content").limit(1).single(),
    supabase.from("songs")
      .select("id, title, slug, song_summary")
      .neq("id", song_id)
      .eq("status", "published"),
    supabase.from("albums").select("id, title, slug").eq("status", "published"),
    supabase
      .from("art_pieces")
      .select("id, title, slug")
      .in("status", ["unreleased", "published"]),
    supabase.from("song_visibility_messages")
      .select("*")
      .eq("song_id", song_id)
      .order("created_at"),
    supabase.from("song_visibility_sections")
      .select("category, content")
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
    messages = [
      {
        role: "user",
        content: `Generate the "${focusCategory.label}" section ONLY. Use the voice profile, the lyrics, and any prior interview context shown in CURRENT STATE above. Output exactly one <visibility:${focusCategory.slug}> block with the full format stack — no other categories on this turn.`,
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
    .map((a) => `- "${a.title}" → /music/albums/${a.slug}`)
    .join("\n");
  const catalogArtLines = ((catalogArt || []) as Array<{ title: string; slug: string }>)
    .map((a) => `- "${a.title}" → /art/${a.slug}`)
    .join("\n");

  // Build existing sections context — include full content from interview categories
  // so Claude can regenerate without re-interviewing
  const interviewCategories = new Set(
    VISIBILITY_CATEGORIES.filter((c) => !c.autoGenerate).map((c) => c.slug)
  );
  const sectionState = (existingSections || [])
    .filter((s: any) => s.content)
    .map((s: any) => {
      if (interviewCategories.has(s.category)) {
        return `### ${s.category} (from prior interview — use this context, do NOT re-ask)\n${s.content}`;
      }
      return `- ${s.category}: has content (will regenerate)`;
    })
    .join("\n\n") || "None generated yet";

  // Build category definitions
  const categoryDefs = VISIBILITY_CATEGORIES
    .map((c) => `- **${c.label}** (slug: ${c.slug}): ${c.description} [${c.autoGenerate ? "auto-generate from lyrics" : "interview Chad"}]`)
    .join("\n");

  const systemPrompt = `You are Chad Lewine's song visibility strategist. Your job is to generate raw marketing material, ideas, and discovery angles for a single song across the visibility categories. You generate raw material that Chad will shape and mold into final content. You NEVER rewrite Chad's words or polish his voice — you provide ideas, suggestions, and analysis that he works with.

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
<direct-answer>40-60 word standalone summary. Self-contained — an AI reads this back verbatim. No intro, no setup, just the answer.</direct-answer>
<prose>
150-300 words of expanded narrative. USE MARKDOWN: **bold** for emphasis, line breaks between paragraphs, > blockquotes for lyric references. This is the citation-worthy layer — depth, context, specifics. Not a wall of text.
</prose>
<key-points>
- Bullet point 1
- Bullet point 2
- Bullet point 3
- Bullet point 4
- Bullet point 5
</key-points>
</visibility:breakdown>

HARD LIMITS PER LAYER:
- direct-answer: 40-60 words. One block. No markdown.
- prose: 150-300 words. MUST use markdown formatting (bold, paragraphs, blockquotes for lyrics). Not an essay.
- key-points: 5-8 bullets. One line each. No sub-bullets.
- Total per category: under 500 words across all three layers combined.

All three sub-layers are required for every category. The direct-answer is a self-contained block (not an intro to the prose). The prose expands with depth. The key-points are a structured summary of the same content, not new content.

VOICE — CRITICAL:
All output (direct-answer, prose, key-points) is PUBLIC-FACING and appears on the song's landing page. NEVER use admin- or SEO-facing vocabulary in any layer. Forbidden: "searcher", "searchers", "seeker", "seekers", "audience segment", "target query", "SEO", "GEO", "intent", "keyphrase", "ranking", "surface", "pickup", "extraction", "discovery angle", "funnel", "interception". If you need to describe the reader, use natural human terms ("listeners", "anyone who", "you", "people who feel X") or just speak about the song itself. The HOOKS category is the ONE EXCEPTION — it's internal/admin-only, so query phrases and admin language are fine there. Every sentence in every other category must read like it was written for a human visitor, not a growth strategist.

BEHAVIOR:
1. For auto-generate categories, analyze the lyrics and generate raw content immediately with all three layers. These don't need Chad's input. Generate them in this order: If You Like, Hooks, Breakdown, Fragments, Cultural Position, Connections, Sync Placements.
2. For interview categories (Story, World, Audience): if the CURRENT STATE section above already contains interview content for a category, use that content to generate the format stack — do NOT re-ask questions you already have answers to. Only interview for categories that have no content yet. When interviewing, ask ONE question at a time.
3. Every idea should be something Chad can act on. No filler.
4. For Fragments, extract specific quotable lines from the lyrics with brief context on why each one works.
5. For Hooks, think about what someone would ask an AI or search engine that this song answers.
6. For Connections, reference specific other songs from the catalog.
7. For Cultural Position: this is PUBLIC-FACING content, not internal strategy. Write it as what the song reflects about where culture is right now. The seeker reads this and recognizes their own world. Not "here are editorial angles to pursue" — instead "here is what this song says about what people are living through." Frame it as cultural commentary, not marketing positioning.
8. For If You Like, name specific famous artists and songs whose fans would genuinely connect with this one. Write in the voice: "If you like [Famous Artist] — [Famous Song], you'll connect with this because…" Format as a list of artist/song pairs with a one-line human reason each (shared feeling, shared stance, shared musical language). Real, well-known artists. Do NOT explain that this is for discovery or searchability — just name the resonances as if recommending to a friend.
9. For Sync Placements, propose concrete placement scenarios where this song would land — film, TV, trailer, ad, game, or platform contexts. Derive the mood, pacing, and thematic shape from the lyrics and (if present) The World / The Story content; then imagine specific scenes the song could score. Each layer must read as natural editorial prose, not as a pitch deck:
   - direct-answer: one self-contained paragraph naming 2–3 strongest placement types in plain language (e.g. "End-credits of a coming-of-age indie film, the climactic driving-away shot of a reflective streaming drama, or a lifestyle brand spot leaning into late-summer nostalgia").
   - prose: expand on the scene-shapes this song fits — pacing, emotional arc, what the visuals are doing while it plays, what kind of story it ends or opens. Reference specific reference films, shows, or ads when it sharpens the picture. Use markdown.
   - key-points: 5–7 bullets, each a single concrete placement scenario written as a searchable phrase. Shape them like things a music supervisor or director would type into a search bar: "End-credits song for a coming-of-age indie film", "Montage in a reflective streaming drama about family", "Trailer bed for a quiet sci-fi feature about memory", "Late-summer nostalgia spot for a lifestyle brand". Concrete genre + visual context + platform. No fluff, no "perfect for…" phrasing.

INTERNAL LINKS:
When the prose layer mentions any of Chad's other songs, albums, or art (especially in the Connections / Other Songs section), use markdown link syntax with the EXACT path from the catalog above. Example: \`[Hyperising](/music/songs/hyperising)\`. Never invent slugs. Never link out to streaming platforms here — internal site links only. The Connections section in particular should link generously to the catalog.

${voiceProfile ? `VOICE PROFILE — write IN this voice:
${voiceProfile}

The direct-answer, prose, and key-points layers must all sound like Chad wrote them. Use his cadence, his phrasing, his metaphors, his tics. If a line drifts toward generic-blog or marketing-speak, rewrite it until it sounds like Chad. The Hooks category is the one place admin/SEO vocabulary is allowed; every other category is public-facing and must read like Chad's own words.` : "(No voice profile saved yet — match the cadence in the lyrics and song summary above.)"}${geoFieldsOnly ? `

GEO-ONLY MODE:
On this turn output ONLY one <geo-fields> block. No <visibility:...> categories. No narration. The block must contain a <citation-summary> (40-60 words about the WHOLE song) and an <entity-tags> list (4-8 short noun phrases — real, searchable entities like "synth-pop", "post-divorce", "Gulf Coast night drive"; not poetic abstractions).` : ""}${focusCategory ? `

FOCUS MODE:
On this turn emit ONLY the <visibility:${focusCategory.slug}> block for "${focusCategory.label}"${needsGeoFieldsHint(song) ? ", PLUS one <geo-fields> block (the song is missing citation_summary or entity_tags — emitting them is REQUIRED on this turn)" : " (do not emit <geo-fields> — the song already has them)"}. Do not emit any other category, do not narrate, do not interview. Output the format stack and stop.` : ""}`;

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
      model: "claude-opus-4-6",
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
      model: "claude-opus-4-6",
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
