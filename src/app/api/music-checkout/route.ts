import { createPublicClient } from "@/lib/supabase-server";
import { createMusicCheckoutSession } from "@/lib/stripe";

type Format = "mp3" | "flac" | "wav";
const FORMATS: Format[] = ["mp3", "flac", "wav"];

function normalizeFormat(raw: unknown): Format {
  return typeof raw === "string" && FORMATS.includes(raw as Format) ? (raw as Format) : "mp3";
}

export async function POST(request: Request) {
  const body = await request.json();
  const { type, id } = body as { type: "song" | "album"; id: string; format?: string };
  const requested = normalizeFormat(body.format);

  if (!type || !id || !["song", "album"].includes(type)) {
    return Response.json({ error: "type (song|album) and id required" }, { status: 400 });
  }

  const supabase = createPublicClient();
  const origin = request.headers.get("origin") || "https://chadlewine.com";

  if (type === "song") {
    const { data: song } = await supabase
      .from("songs")
      .select("id, title, slug, price, download_path_mp3, download_path_flac, download_path_wav, download_path")
      .eq("id", id)
      .single();
    if (!song) return Response.json({ error: "Song not found" }, { status: 404 });
    if (!song.price) return Response.json({ error: "Song has no price set" }, { status: 400 });

    const formatPath = (song as Record<string, string | null>)[`download_path_${requested}`];
    const noExplicitFormats = !song.download_path_mp3 && !song.download_path_flac && !song.download_path_wav;
    const legacyFallback = requested === "mp3" && noExplicitFormats && !!song.download_path;
    if (!formatPath && !legacyFallback) {
      return Response.json({ error: `Format ${requested.toUpperCase()} not available for this song` }, { status: 400 });
    }

    const { data: assoc } = await supabase
      .from("album_songs")
      .select("album:albums(title, slug, cover_art_path, release_date)")
      .eq("song_id", id)
      .single();

    const album = (assoc as { album?: { title?: string; slug?: string; cover_art_path?: string | null; release_date?: string | null } } | null)?.album;

    const year = album?.release_date ? new Date(album.release_date).getFullYear() : null;
    const parts = [`Digital download (${requested.toUpperCase()})`];
    if (album?.title) parts.push(`from ${album.title}`);
    if (year) parts.push(String(year));
    const description = parts.join(" · ");

    const session = await createMusicCheckoutSession({
      type: "song",
      item_id: song.id,
      format: requested,
      title: song.title,
      description,
      album_title: album?.title,
      price: song.price,
      cover_art_url: album?.cover_art_path || undefined,
      success_url: `${origin}/music/purchase/digital-download-thank-you?type=song&id=${song.id}`,
      cancel_url: `${origin}/music/songs/${song.slug}`,
    });

    if (!session.url) return Response.json({ error: "No checkout URL" }, { status: 500 });
    return Response.json({ url: session.url });
  }

  // Album
  const { data: album } = await supabase
    .from("albums")
    .select("id, title, slug, cover_art_path, price, release_date, download_path_mp3, download_path_flac, download_path_wav")
    .eq("id", id)
    .single();
  if (!album) return Response.json({ error: "Album not found" }, { status: 404 });
  if (!album.price) return Response.json({ error: "Album has no price set" }, { status: 400 });

  const formatPath = (album as Record<string, string | null>)[`download_path_${requested}`];
  if (!formatPath) {
    const noExplicitFormats =
      !album.download_path_mp3 && !album.download_path_flac && !album.download_path_wav;
    if (requested === "mp3" && noExplicitFormats) {
      // Legacy fallback: at least one track has download_path (webhook will grab first).
      const { count } = await supabase
        .from("album_songs")
        .select("songs!inner(download_path)", { count: "exact", head: true })
        .eq("album_id", album.id)
        .not("songs.download_path", "is", null);
      if (!count) {
        return Response.json({ error: "Album has no download available" }, { status: 400 });
      }
    } else {
      return Response.json({ error: `Format ${requested.toUpperCase()} not available for this album` }, { status: 400 });
    }
  }

  const { data: tracks } = await supabase
    .from("album_songs")
    .select("song:songs(duration_seconds)")
    .eq("album_id", album.id);

  const trackCount = tracks?.length ?? 0;
  const totalSecs = (tracks || []).reduce((sum, t) => {
    const s = (t as { song?: { duration_seconds?: number | null } }).song?.duration_seconds || 0;
    return sum + s;
  }, 0);
  const totalMins = Math.round(totalSecs / 60);
  const year = album.release_date ? new Date(album.release_date).getFullYear() : null;

  const parts = [`Digital download (${requested.toUpperCase()})`];
  if (trackCount) parts.push(`${trackCount} ${trackCount === 1 ? "track" : "tracks"}`);
  if (year) parts.push(String(year));
  if (totalMins) parts.push(`${totalMins} min`);
  const description = parts.join(" · ");

  const session = await createMusicCheckoutSession({
    type: "album",
    item_id: album.id,
    format: requested,
    title: album.title,
    description,
    price: album.price,
    cover_art_url: album.cover_art_path || undefined,
    success_url: `${origin}/music/purchase/digital-download-thank-you?type=album&id=${album.id}`,
    cancel_url: `${origin}/music/albums/${album.slug}`,
  });

  if (!session.url) return Response.json({ error: "No checkout URL" }, { status: 500 });
  return Response.json({ url: session.url });
}
