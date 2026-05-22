import "server-only";
import { getMediaConfig } from "./media-config";
import { signBunnyUrl } from "./bunny-token";

const SEGMENT_TTL_SECONDS = 60 * 60; // 1 hour — covers a full listen + buffer.
const PLAYLIST_FETCH_TTL_SECONDS = 60; // Server-to-Bunny only; never sees client.

function fanTrackConfig() {
  return getMediaConfig("fan-track");
}

// Signs a path inside the fan-tracks Bunny pull zone. Token-auth is
// required (configured ON in the pull zone settings).
export function signFanTrackUrl(
  path: string,
  expiresInSec: number = SEGMENT_TTL_SECONDS,
): string {
  return signBunnyUrl(fanTrackConfig(), path, expiresInSec);
}

// Fetches a playlist.m3u8 from Bunny via a short-TTL signed URL.
// Returns the raw text — caller is responsible for rewriting URIs.
export async function fetchFanTrackPlaylist(playlistPath: string): Promise<string> {
  const url = signFanTrackUrl(playlistPath, PLAYLIST_FETCH_TTL_SECONDS);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch HLS playlist: ${res.status} ${res.statusText}`);
  }
  return await res.text();
}

interface RewriteOpts {
  // The original playlist (text contents from Bunny).
  playlist: string;
  // Path in the fan-tracks zone of the playlist file (used to resolve
  // relative segment URIs against the same directory).
  playlistPath: string;
  // The full URL where the client should fetch the AES key. Replaces the
  // playlist's EXT-X-KEY URI so the browser hits our auth-gated endpoint.
  keyUri: string;
}

// Walks an HLS playlist line by line, rewriting segment URIs to signed
// Bunny URLs and EXT-X-KEY URIs to our key endpoint. Preserves comments,
// headers, and unrelated tags. Handles both relative ("segment000.ts")
// and absolute ("https://.../segment000.ts") segment URIs.
export function rewriteHlsPlaylist(opts: RewriteOpts): string {
  const { playlist, playlistPath, keyUri } = opts;
  const baseDir = playlistPath.replace(/[^/]+$/, ""); // "for-my-fans-01/playlist.m3u8" -> "for-my-fans-01/"

  return playlist
    .split(/\r?\n/)
    .map((line) => {
      if (line.startsWith("#EXT-X-KEY")) {
        // Replace whatever URI="..." the ingest wrote with our key endpoint.
        return line.replace(/URI="[^"]*"/, `URI="${keyUri}"`);
      }
      if (line.length === 0 || line.startsWith("#")) {
        return line;
      }
      // Segment line. Resolve relative URIs against the playlist's directory.
      const segmentPath = line.startsWith("http")
        ? line // Already absolute — sign as-is. (Unusual for our ingest, but safe.)
        : baseDir + line;
      return signFanTrackUrl(segmentPath, SEGMENT_TTL_SECONDS);
    })
    .join("\n");
}
