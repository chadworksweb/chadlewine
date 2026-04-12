import { createAdminClient } from "@/lib/supabase-server";
import { fetchBadge } from "@/lib/rising-compass";
import { VISIBILITY_CATEGORIES } from "@/lib/song-visibility";

export async function POST(request: Request) {
  const { song_id, message } = await request.json();
  if (!song_id) return Response.json({ error: "song_id required" }, { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });

  const supabase = createAdminClient();

  // Load all context in parallel
  const [
    { data: song },
    { data: junction },
    { data: vpRow },
    { data: catalog },
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
      .select("id, title, song_summary")
      .neq("id", song_id)
      .eq("status", "published"),
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

  // Save user message if provided
  if (message) {
    await supabase.from("song_visibility_messages").insert({
      song_id,
      role: "user",
      content: message,
    });
  }

  // Build conversation messages
  const messages = (history || []).map((m: any) => ({
    role: m.role,
    content: m.content,
  }));
  if (message) {
    messages.push({ role: "user", content: message });
  }

  // If no messages at all (initial kick-off), add a start prompt
  if (messages.length === 0) {
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

  // Build catalog context
  const catalogLines = (catalog || [])
    .map((s: any) => `- ${s.title}${s.song_summary ? `: ${s.song_summary}` : ""}`)
    .join("\n");

  // Build existing sections context
  const sectionState = (existingSections || [])
    .filter((s: any) => s.content)
    .map((s: any) => `- ${s.category}: has content`)
    .join("\n") || "None generated yet";

  // Build category definitions
  const categoryDefs = VISIBILITY_CATEGORIES
    .map((c) => `- **${c.label}** (slug: ${c.slug}): ${c.description} [${c.autoGenerate ? "auto-generate from lyrics" : "interview Chad"}]`)
    .join("\n");

  const systemPrompt = `You are Chad Lewine's song visibility strategist. Your job is to generate raw marketing material, ideas, and discovery angles for a single song across 10 categories. You generate raw material that Chad will shape and mold into final content. You NEVER rewrite Chad's words or polish his voice — you provide ideas, suggestions, and analysis that he works with.

THE SONG:
Title: ${song.title}
Album: ${album?.title || "Unknown"}
Release Date: ${song.release_date || "Not set"}
Duration: ${song.duration_seconds ? `${Math.floor(song.duration_seconds / 60)}:${String(song.duration_seconds % 60).padStart(2, "0")}` : "Unknown"}
ISRC: ${song.isrc || "Not set"}

Lyrics:
${song.lyrics || "(No lyrics available)"}

Song Summary: ${song.song_summary || "(Not written yet)"}

${badge ? `RISING COMPASS DATA:
Tier: ${badge.tier_label}
Charge: ${badge.charge}
Charge Summary: ${badge.charge_summary || "None"}
Contaminated: ${badge.contaminated ? `Yes — ${badge.contamination_note}` : "No"}` : "RISING COMPASS: Not classified yet"}

CATALOG (other songs by Chad):
${catalogLines || "No other published songs"}

THE 10 VISIBILITY CATEGORIES:
${categoryDefs}

CURRENT STATE:
${sectionState}

BEHAVIOR:
1. For auto-generate categories (Breakdown, Hooks, Fragments, Connections, Cultural Position), analyze the lyrics and generate raw content immediately. These don't need Chad's input.
2. For interview categories (Story, World, Audience, Visual, Commerce), ask Chad ONE question at a time. Wait for his answer before asking the next question.
3. When you generate content for a category, wrap it in delimiters like this:
   <visibility:breakdown>
   Your generated content here...
   </visibility:breakdown>
4. Keep each category's content to focused, actionable ideas — not essays. Bullet points, angles, specific suggestions.
5. For Fragments, extract specific quotable lines from the lyrics with brief context on why each one works.
6. For Hooks, think about what someone would ask an AI or search engine that this song answers.
7. For Connections, reference specific other songs from the catalog.
8. Be direct. No filler. Every idea should be something Chad can act on.

${voiceProfile ? `VOICE PROFILE (for awareness — do NOT use this to rewrite anything, only to understand Chad's voice when generating ideas):
${voiceProfile}` : ""}`;

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

        // Stream complete — save assistant message and extract sections
        await supabase.from("song_visibility_messages").insert({
          song_id,
          role: "assistant",
          content: fullText,
        });

        // Parse <visibility:slug> delimiters and upsert sections
        const sectionRegex = /<visibility:([a-z-]+)>([\s\S]*?)<\/visibility:\1>/g;
        let match;
        while ((match = sectionRegex.exec(fullText)) !== null) {
          const [, category, content] = match;
          const validCategory = VISIBILITY_CATEGORIES.find((c) => c.slug === category);
          if (!validCategory) continue;

          await supabase.from("song_visibility_sections").upsert(
            {
              song_id,
              category,
              content: content.trim(),
              status: "draft",
            },
            { onConflict: "song_id,category" }
          );
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
