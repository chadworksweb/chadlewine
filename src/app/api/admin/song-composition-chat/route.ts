import { createAdminClient } from "@/lib/supabase-server";
import { fetchBadge } from "@/lib/rising-compass";
import { VISIBILITY_CATEGORIES } from "@/lib/song-visibility";
import { markdownToHtml } from "@/lib/markdown";

export async function POST(request: Request) {
  const { song_id, message } = await request.json();
  if (!song_id) return Response.json({ error: "song_id required" }, { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });

  const supabase = createAdminClient();

  const [
    { data: song },
    { data: junction },
    { data: vpRow },
    { data: rawSections },
    { data: existingComp },
    { data: history },
  ] = await Promise.all([
    supabase.from("songs").select("*").eq("id", song_id).single(),
    supabase.from("release_songs")
      .select("track_number, release:releases(id, title, slug)")
      .eq("song_id", song_id)
      .single(),
    supabase.from("voice_profile").select("content").limit(1).single(),
    supabase.from("song_visibility_sections")
      .select("category, content")
      .eq("song_id", song_id),
    supabase.from("song_composition")
      .select("*")
      .eq("song_id", song_id)
      .single(),
    supabase.from("song_composition_messages")
      .select("*")
      .eq("song_id", song_id)
      .order("created_at"),
  ]);

  if (!song) return Response.json({ error: "Song not found" }, { status: 404 });

  const album = (junction as any)?.album;
  const voiceProfile = vpRow?.content || "";
  const badge = await fetchBadge(song.title, "Chad Lewine");

  // Save user message
  if (message) {
    await supabase.from("song_composition_messages").insert({
      song_id,
      role: "user",
      content: message,
    });
  }

  // Build conversation
  const messages = (history || []).map((m: any) => ({
    role: m.role,
    content: m.content,
  }));
  if (message) {
    messages.push({ role: "user", content: message });
  }

  if (messages.length === 0) {
    const startMsg = "Compose the publishable content for this song page. Use the raw visibility data to create a unified piece written to the person looking for this song. Fill all GEO fields to hit 100.";
    messages.push({ role: "user", content: startMsg });
    await supabase.from("song_composition_messages").insert({
      song_id,
      role: "user",
      content: startMsg,
    });
  }

  // Build raw section context
  const sectionContext = (rawSections || [])
    .map((s: any) => {
      const cat = VISIBILITY_CATEGORIES.find((c) => c.slug === s.category);
      return `### ${cat?.label || s.category}\n${s.content}`;
    })
    .join("\n\n");

  // Current GEO state
  const geoState = [
    `Citation summary: ${song.citation_summary || "(empty)"}`,
    `Focus keyphrase: ${song.focus_keyphrase || "(empty)"}`,
    `Secondary keyphrases: ${JSON.stringify(song.secondary_keyphrases || [])}`,
    `PAA pairs: ${JSON.stringify(song.paa_pairs || [])}`,
    `Entity tags: ${JSON.stringify(song.entity_tags || [])}`,
    `SEO title: ${song.seo_title || "(empty)"}`,
    `SEO description: ${song.seo_description || "(empty)"}`,
  ].join("\n");

  const systemPrompt = `ABSOLUTE HARD CONSTRAINTS. Read these first. They override everything else.

1. NEVER use em dashes (—). Not once. Use commas, periods, or parentheses instead. If you catch yourself typing one, replace it.
2. NEVER use sentence triplets (three short punchy sentences in a row).
3. NEVER use clause triplets (three "or" options or three "and" options stacked).
4. NEVER use: "game-changer," "next-level," "world-class," "cutting-edge," "seamless," "streamlined," "hassle-free," "peace of mind," "truly," "really," "incredibly," "absolutely."
5. NEVER use: "whether you're looking for," "in today's fast-paced world," "here's the thing," "let's dive in," "it's worth noting," "that said," "moreover," "furthermore," "we understand," "you deserve," "we're here to help," "when it comes to," "imagine this:," "picture this:," "in short," "simply put," "bottom line."
6. NEVER bold the first sentence of every paragraph.
7. NEVER end sections with rhetorical questions.
8. NEVER list exactly three items.
9. NEVER start consecutive paragraphs with the same word.

These constraints are non-negotiable. The voice profile below elaborates on them and adds more rules. Read both sections as absolute law.

---

You are composing the publishable content for a song page on chadlewine.com. You have raw visibility data from 9 categories of analysis. Your job is to synthesize it into a single, unified piece of content written directly to the person looking for this song.

This is NOT marketing copy. This is NOT an artist bio. This is content written for the person who needs this song but doesn't know it exists yet. When they find this page, through search, through an AI answer, through a recommendation, the content speaks to them. It tells them what this song is, what it does, and why it matters to them specifically.

THE SONG:
Title: ${song.title}
Album: ${album?.title || "Unknown"}
Lyrics:
${song.lyrics || "(No lyrics)"}

Song Summary: ${song.song_summary || "(Not written)"}

${badge ? `RISING COMPASS:
Tier: ${badge.tier_label} | Charge: ${badge.charge}
${badge.charge_summary || ""}` : ""}

RAW VISIBILITY DATA (9 categories of internal analysis):
${sectionContext || "(No raw sections yet)"}

${existingComp?.content ? `CURRENT COMPOSITION DRAFT:\n${existingComp.content}` : ""}

CURRENT GEO STATE:
${geoState}

VOICE PROFILE. This is a constraint. All output MUST match this voice. Pay special attention to section V (Language Rules), those are hard constraints:
${voiceProfile}

COMPOSITION REQUIREMENTS:
1. Write a unified piece. No category labels, no internal structure exposed. Natural subheadings are fine if they emerge from the content.
2. Use markdown formatting: ## for headings, **bold** for emphasis, bullet lists where natural.
3. The opening sentence must work as a standalone citation, the thing an AI reads back when asked about this song.
4. Weave in searchable language naturally. Use the words the seeker would actually use to find this song.
5. Include at least 2 H2 headings for structure.
6. Target 300-600 words. Dense, not padded.
7. Reference the lyrics specifically. Pull key lines and contextualize them for the seeker.

FORMAT STACK CONTEXT:
This composition is the NARRATIVE LAYER of a format stack. On the page, each section has three extraction layers: a direct-answer block (40-60 words), prose narrative, and a bullet summary. The composition IS the prose for the "Full Story" section. Other sections handle their own direct-answers and bullets. Your job is to write the deep, citation-worthy narrative that gives AI engines something substantial to cite. Do not duplicate what the visibility sections cover in list form. Go deeper.

OUTPUT FORMAT:
Wrap the composed content in <composition> delimiters:
<composition>
Your composed markdown content here...
</composition>

After the composition, output GEO field suggestions (all in Chad's voice):
<geo:citation_summary>One sentence an AI reads back to the seeker</geo:citation_summary>
<geo:focus_keyphrase>The search the seeker types (max 80 chars)</geo:focus_keyphrase>
<geo:secondary_keyphrases>["keyphrase 1", "keyphrase 2", "keyphrase 3"]</geo:secondary_keyphrases>
<geo:paa_pairs>[{"question":"What someone would ask","answer":"Answer written to the seeker in Chad's voice"}]</geo:paa_pairs>
<geo:entity_tags>["theme", "genre", "reference"]</geo:entity_tags>
<geo:seo_title>Page title for search (max 60 chars)</geo:seo_title>
<geo:seo_description>Meta description for search (max 160 chars)</geo:seo_description>

GEO SCORING (aim for 100/100):
- Citation summary (20 pts): non-empty
- Focus keyphrase (15 pts): non-empty, max 80 chars
- Composition word count (15 pts): 300+ words
- PAA pairs (20 pts): 3+ pairs = 20, 2 = 15, 1 = 8
- Secondary keyphrases (10 pts): 3+ = 10, 1+ = 5
- Entity tags (10 pts): 2+ = 10, 1 = 5
- SEO title + description (10 pts): both filled = 10`;

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
              // skip
            }
          }
        }

        // Save assistant message
        await supabase.from("song_composition_messages").insert({
          song_id,
          role: "assistant",
          content: fullText,
        });

        // Extract composition
        const compMatch = fullText.match(/<composition>([\s\S]*?)<\/composition>/);
        if (compMatch) {
          // Safety net: strip em dashes that slipped past the voice constraints
          const composedMarkdown = compMatch[1]
            .trim()
            .replace(/\s*—\s*/g, ", ")
            .replace(/\s*–\s*/g, ", ");
          const composedHtml = await markdownToHtml(composedMarkdown);

          // Archive existing composition as revision before overwriting
          if (existingComp && existingComp.content) {
            const { data: lastRev } = await supabase
              .from("song_composition_revisions")
              .select("revision_number")
              .eq("song_id", song_id)
              .order("revision_number", { ascending: false })
              .limit(1)
              .single();
            const nextRev = (lastRev?.revision_number || 0) + 1;
            await supabase.from("song_composition_revisions").insert({
              song_id,
              content: existingComp.content,
              content_html: existingComp.content_html || "",
              revision_number: nextRev,
            });
          }

          // Upsert composition
          if (existingComp) {
            await supabase.from("song_composition").update({
              content: composedMarkdown,
              content_html: composedHtml,
            }).eq("id", existingComp.id);
          } else {
            await supabase.from("song_composition").insert({
              song_id,
              content: composedMarkdown,
              content_html: composedHtml,
              status: "draft",
            });
          }
        }

        // Extract GEO fields and update songs table
        const geoUpdates: Record<string, unknown> = {};

        const citMatch = fullText.match(/<geo:citation_summary>([\s\S]*?)<\/geo:citation_summary>/);
        if (citMatch) geoUpdates.citation_summary = citMatch[1].trim();

        const fkMatch = fullText.match(/<geo:focus_keyphrase>([\s\S]*?)<\/geo:focus_keyphrase>/);
        if (fkMatch) geoUpdates.focus_keyphrase = fkMatch[1].trim();

        const skMatch = fullText.match(/<geo:secondary_keyphrases>([\s\S]*?)<\/geo:secondary_keyphrases>/);
        if (skMatch) {
          try { geoUpdates.secondary_keyphrases = JSON.parse(skMatch[1].trim()); } catch {}
        }

        const paaMatch = fullText.match(/<geo:paa_pairs>([\s\S]*?)<\/geo:paa_pairs>/);
        if (paaMatch) {
          try { geoUpdates.paa_pairs = JSON.parse(paaMatch[1].trim()); } catch {}
        }

        const etMatch = fullText.match(/<geo:entity_tags>([\s\S]*?)<\/geo:entity_tags>/);
        if (etMatch) {
          try { geoUpdates.entity_tags = JSON.parse(etMatch[1].trim()); } catch {}
        }

        const stMatch = fullText.match(/<geo:seo_title>([\s\S]*?)<\/geo:seo_title>/);
        if (stMatch) geoUpdates.seo_title = stMatch[1].trim();

        const sdMatch = fullText.match(/<geo:seo_description>([\s\S]*?)<\/geo:seo_description>/);
        if (sdMatch) geoUpdates.seo_description = sdMatch[1].trim();

        if (Object.keys(geoUpdates).length > 0) {
          await supabase.from("songs").update(geoUpdates).eq("id", song_id);
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
