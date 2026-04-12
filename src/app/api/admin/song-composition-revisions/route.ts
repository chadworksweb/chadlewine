import { createAdminClient } from "@/lib/supabase-server";
import { markdownToHtml } from "@/lib/markdown";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const songId = searchParams.get("song_id");
  if (!songId) return Response.json({ error: "song_id required" }, { status: 400 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("song_composition_revisions")
    .select("*")
    .eq("song_id", songId)
    .order("revision_number", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

// POST to restore a revision as the current composition
export async function POST(request: Request) {
  const { song_id, revision_id } = await request.json();
  if (!song_id || !revision_id) return Response.json({ error: "song_id and revision_id required" }, { status: 400 });

  const supabase = createAdminClient();

  // Get the revision
  const { data: revision } = await supabase
    .from("song_composition_revisions")
    .select("*")
    .eq("id", revision_id)
    .single();
  if (!revision) return Response.json({ error: "Revision not found" }, { status: 404 });

  // Archive the current composition first
  const { data: current } = await supabase
    .from("song_composition")
    .select("*")
    .eq("song_id", song_id)
    .single();

  if (current && current.content) {
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
      content: current.content,
      content_html: current.content_html || "",
      revision_number: nextRev,
    });
  }

  // Restore the revision as current
  const restoredHtml = await markdownToHtml(revision.content);
  if (current) {
    await supabase.from("song_composition").update({
      content: revision.content,
      content_html: restoredHtml,
    }).eq("id", current.id);
  } else {
    await supabase.from("song_composition").insert({
      song_id,
      content: revision.content,
      content_html: restoredHtml,
      status: "draft",
    });
  }

  const { data: updated } = await supabase
    .from("song_composition")
    .select("*")
    .eq("song_id", song_id)
    .single();

  return Response.json(updated);
}
