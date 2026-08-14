import { createAdminClient } from "@/lib/supabase-server";
import { getMediaConfig } from "@/lib/media-config";
import { signBunnyUrl } from "@/lib/bunny-token";
import { resolveSkuDownloadPaths } from "@/lib/release-skus";
import { type DownloadFormat, isDownloadFormat } from "@/lib/audio-formats";

// GET /api/download/[token]
// token = purchases.id. Re-resolves the current song/album download path by
// format on every request, so file moves don't break old purchase links.
// Raw paths (post-migration) get signed against chadlewine-music-downloads.
// Legacy full URLs (pre-migration Chad Rising zones) are 302'd as-is.

type Format = DownloadFormat;
type RingtoneFormat = "m4r" | "mp3";

function isFullUrl(v: string | null | undefined): v is string {
  return typeof v === "string" && /^https?:\/\//i.test(v);
}

async function resolveRingtonePath(
  supabase: ReturnType<typeof createAdminClient>,
  itemId: string,
  format: RingtoneFormat,
): Promise<string | null> {
  const col = `ringtone_path_${format}` as const;
  const { data } = await supabase
    .from("songs")
    .select(col)
    .eq("id", itemId)
    .single<Record<string, string | null>>();
  return data?.[col] || null;
}

async function resolveTitle(
  supabase: ReturnType<typeof createAdminClient>,
  itemType: string,
  itemId: string,
): Promise<string | null> {
  if (itemType === "song" || itemType === "ringtone") {
    const { data } = await supabase
      .from("songs")
      .select("title")
      .eq("id", itemId)
      .single<{ title: string | null }>();
    return data?.title ?? null;
  }
  if (itemType === "release") {
    const { data } = await supabase
      .from("releases")
      .select("title")
      .eq("id", itemId)
      .single<{ title: string | null }>();
    return data?.title ?? null;
  }
  return null;
}

function sanitizeFilename(name: string): string {
  return (
    name
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "download"
  );
}

// MP3 plays inline in browsers — proxy-stream upstream with Content-Disposition
// so the link in the order email saves as a file instead of opening a tab.
// WAV/FLAC don't have this problem and stay on the 302 redirect path.
async function streamAsAttachment(
  url: string,
  filename: string,
  contentType: string,
): Promise<Response> {
  const upstream = await fetch(url);
  if (!upstream.ok || !upstream.body) {
    return new Response("Upstream error", { status: 502 });
  }
  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "private, max-age=0, no-store",
  };
  const len = upstream.headers.get("content-length");
  if (len) headers["Content-Length"] = len;
  return new Response(upstream.body, { status: 200, headers });
}

async function resolveDownloadPath(
  supabase: ReturnType<typeof createAdminClient>,
  releaseSkuId: string | null,
  songSkuId: string | null,
  format: Format,
): Promise<string | null> {
  // SKU-first lookup. Post-migration commerce writes release_sku_id /
  // song_sku_id on every purchase; SKU rows own the download paths. For a
  // physical SKU (vinyl/cd/cassette), resolveSkuDownloadPaths falls back to
  // the sibling digital SKU so the included digital copy resolves here too.
  if (releaseSkuId || songSkuId) {
    const { byReleaseSku, bySongSku } = await resolveSkuDownloadPaths(
      supabase,
      releaseSkuId ? [releaseSkuId] : [],
      songSkuId ? [songSkuId] : [],
    );
    const paths = releaseSkuId
      ? byReleaseSku.get(releaseSkuId)
      : songSkuId
        ? bySongSku.get(songSkuId)
        : undefined;
    return paths?.[format] ?? null;
  }

  // No SKU resolved — songs/releases are SKU-only now; no legacy path fallback.
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
    .select(
      "id, item_type, item_id, format, download_url, download_expires_at, release_sku_id, song_sku_id",
    )
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

  if (!["song", "release", "ringtone"].includes(purchase.item_type) || !purchase.item_id) {
    return new Response("Download not available for this purchase", { status: 400 });
  }

  const qs = new URL(req.url).searchParams.get("format");

  // Ringtones are their own SKU. Buyer picks platform at download time
  // (?format=m4r for iPhone, ?format=mp3 for Android). Default to m4r.
  if (purchase.item_type === "ringtone") {
    const ringtoneFormat: RingtoneFormat =
      qs === "m4r" || qs === "mp3" ? qs : "m4r";
    const ringtonePath = await resolveRingtonePath(supabase, purchase.item_id, ringtoneFormat);
    if (!ringtonePath) {
      return new Response("Ringtone not yet available", { status: 202 });
    }
    const finalUrl = isFullUrl(ringtonePath)
      ? ringtonePath
      : signBunnyUrl(getMediaConfig("music-download"), ringtonePath);
    const title = await resolveTitle(supabase, purchase.item_type, purchase.item_id);
    const filename = `${sanitizeFilename(title ?? "ringtone")}.${ringtoneFormat}`;
    const contentType = ringtoneFormat === "mp3" ? "audio/mpeg" : "audio/mp4";
    return streamAsAttachment(finalUrl, filename, contentType);
  }

  const requested: Format | null = isDownloadFormat(qs) ? qs : null;
  const format: Format =
    requested ?? (isDownloadFormat(purchase.format) ? purchase.format : "mp3");

  const pathOrUrl = await resolveDownloadPath(
    supabase,
    purchase.release_sku_id || null,
    purchase.song_sku_id || null,
    format,
  );

  if (!pathOrUrl) {
    return new Response("Download not yet available", { status: 202 });
  }

  const finalUrl = isFullUrl(pathOrUrl)
    ? pathOrUrl
    : signBunnyUrl(getMediaConfig("music-download"), pathOrUrl);

  if (format === "mp3") {
    const title = await resolveTitle(supabase, purchase.item_type, purchase.item_id);
    const filename = `${sanitizeFilename(title ?? "download")}.mp3`;
    return streamAsAttachment(finalUrl, filename, "audio/mpeg");
  }

  return Response.redirect(finalUrl, 302);
}
