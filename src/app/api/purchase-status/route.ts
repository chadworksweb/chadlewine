import { createAdminClient } from "@/lib/supabase-server";

// Public endpoint — looks up most recent purchase by type + id.
// Returns a token (purchase.id) that /api/download/[token] resolves + signs
// on every request. For album purchases (format=null), also returns the
// available formats so the thank-you page can render per-format buttons.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const id = searchParams.get("id");

  if (!type || !id) {
    return Response.json({ error: "type and id required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Find most recent purchase for this item in the last hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { data: purchase } = await supabase
    .from("purchases")
    .select("id, format")
    .eq("item_type", type)
    .eq("item_id", id)
    .gte("created_at", oneHourAgo)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!purchase) {
    return Response.json({ status: "pending" });
  }

  // Resolve per-format availability when the purchase didn't commit to a format
  // at checkout (album flow).
  let availableFormats: Array<"mp3" | "flac" | "wav"> = [];
  if (!purchase.format) {
    const table = type === "album" ? "albums" : "songs";
    const { data: item } = await supabase
      .from(table)
      .select("download_path_mp3, download_path_flac, download_path_wav")
      .eq("id", id)
      .single();
    if (item) {
      availableFormats = (["mp3", "flac", "wav"] as const).filter(
        (f) => (item as Record<string, unknown>)[`download_path_${f}`],
      );
    }
  }

  return Response.json({
    status: "ready",
    token: purchase.id,
    format: purchase.format || null,
    availableFormats,
  });
}
