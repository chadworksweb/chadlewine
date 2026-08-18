// Bunny Stream direct-playback URL builders. Client-safe (no secrets): Bunny
// Stream serves a per-video HLS master playlist and a generated thumbnail off
// the library's pull-zone CDN host. We point our own <video> + hls.js at the
// playlist so the Pantheon owns the player UI (adaptive bitrate still happens
// in the HLS client). If the Stream library has token authentication ON, swap
// these for a signed route mirroring src/lib/bunny-hls.ts (audio path).

// Normalize to a scheme-prefixed origin with no trailing slash. The repo's
// other pull-zone env values include "https://"; this tolerates either form.
const STREAM_HOST = (() => {
  const raw = process.env.NEXT_PUBLIC_BUNNY_STREAM_PULL_ZONE;
  if (!raw) return null;
  const trimmed = raw.replace(/\/+$/, "");
  return /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
})();

// True when a CDN host is configured, i.e. we can play stream_id natively.
// Until then, callers fall back to the Bunny iframe embed so nothing breaks.
export function hasStreamHost(): boolean {
  return Boolean(STREAM_HOST);
}

// Master HLS playlist for a Bunny Stream video GUID. Returns null when no host
// is configured so callers can choose the iframe fallback.
export function streamPlaylistUrl(streamId: string | null | undefined): string | null {
  if (!streamId || !STREAM_HOST) return null;
  return `${STREAM_HOST}/${streamId}/playlist.m3u8`;
}

// Bunny auto-generates thumbnail.jpg per video. Used as the naos poster when a
// row has no explicit thumbnail_path.
export function streamThumbnailUrl(streamId: string | null | undefined): string | null {
  if (!streamId || !STREAM_HOST) return null;
  return `${STREAM_HOST}/${streamId}/thumbnail.jpg`;
}

// Numeric Stream library that owns every videos.stream_id GUID. Bunny's embed
// path is /embed/{libraryId}/{videoId} -- this URL omitted the library ID until
// 2026-08-18 and therefore 404'd, which is why the June outage (a missing
// NEXT_PUBLIC_BUNNY_STREAM_PULL_ZONE on the host) blacked out every video
// instead of degrading to the iframe. Hardcoded rather than env-configured so
// the fallback can never be knocked out by the same class of missing-env bug.
const STREAM_LIBRARY_ID = "569029";

// Bunny Stream iframe embed -- the degrade path for stream videos when no CDN
// host is set, and the source for non-Bunny embeds is handled by the caller.
export function streamIframeUrl(streamId: string | null | undefined): string | null {
  if (!streamId) return null;
  return `https://iframe.mediadelivery.net/embed/${STREAM_LIBRARY_ID}/${streamId}`;
}
