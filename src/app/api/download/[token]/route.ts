import { createAdminClient } from "@/lib/supabase-server";
import { getMediaConfig } from "@/lib/media-config";
import { signBunnyUrl } from "@/lib/bunny-token";

// GET /api/download/[token]
// token = purchases.id. Re-resolves the current song/album download path by
// format on every request, so file moves don't break old purchase links.
// Raw paths (post-migration) get signed against chadlewine-music-downloads.
// Legacy full URLs (pre-migration Chad Rising zones) are 302'd as-is.

type Format = "mp3" | "flac" | "wav";

function isFullUrl(v: string | null | undefined): v is string {
  return typeof v === "string" && /^https?:\/\//i.test(v);
}

async function resolveDownloadPath(
  supabase: ReturnType<typeof createAdminClient>,
  itemType: string,
  itemId: string,
  format: Format,
): Promise<string | null> {
  const col = `download_path_${format}` as const;

  if (itemType === "song") {
    const { data } = await supabase
      .from("songs")
      .select(`${col}, download_path`)
      .eq("id", itemId)
      .single<Record<string, string | null>>();
    return data?.[col] || data?.download_path || null;
  }

  if (itemType === "album") {
    const { data } = await supabase
      .from("albums")
      .select(col)
      .eq("id", itemId)
      .single<Record<string, string | null>>();
    if (data?.[col]) return data[col];

    if (format === "mp3") {
      const { data: albumSongs } = await supabase
        .from("album_songs")
        .select("track_number, songs(download_path)")
        .eq("album_id", itemId)
        .order("track_number");
      for (const as of albumSongs ?? []) {
        const songs = (as as unknown as { songs: unknown }).songs;
        const song = Array.isArray(songs) ? songs[0] : songs;
        const path = (song as { download_path?: string | null } | null | undefined)
          ?.download_path;
        if (path) return path;
      }
    }
  }

  return null;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const supabase = createAdminClient();

  const { data: purchase } = await supabase
    .from("purchases")
    .select("id, item_type, item_id, format, download_url, download_expires_at")
    .eq("id", token)
    .single();

  if (!purchase) return new Response("Not found", { status: 404 });

  if (
    purchase.download_expires_at &&
    new Date(purchase.download_expires_at) < new Date()
  ) {
    return new Response("Download link expired", { status: 410 });
  }

  if (purchase.download_url) {
    return Response.redirect(purchase.download_url, 302);
  }

  if (!["song", "album"].includes(purchase.item_type) || !purchase.item_id) {
    return new Response("Download not available for this purchase", { status: 400 });
  }

  // Resolve format: query param > purchase.format > default mp3.
  // Query param lets buyers pick at download time — required for album
  // purchases (format=null on the row).
  const qsFormat = new URL(req.url).searchParams.get("format");
  const requested: Format | null =
    qsFormat === "mp3" || qsFormat === "flac" || qsFormat === "wav" ? qsFormat : null;
  const format: Format =
    requested ??
    (purchase.format === "flac" || purchase.format === "wav"
      ? (purchase.format as Format)
      : purchase.format === "mp3"
      ? "mp3"
      : "mp3");

  const pathOrUrl = await resolveDownloadPath(
    supabase,
    purchase.item_type,
    purchase.item_id,
    format,
  );

  if (!pathOrUrl) {
    return new Response("Download not yet available", { status: 202 });
  }

  if (isFullUrl(pathOrUrl)) {
    return Response.redirect(pathOrUrl, 302);
  }

  const signed = signBunnyUrl(getMediaConfig("music-download"), pathOrUrl);
  return Response.redirect(signed, 302);
}
