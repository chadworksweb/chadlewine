import { getCurrentSession } from "@/lib/account";
import { findFanTrackBySlug, findGrantByToken } from "@/lib/fan-tracks";
import { fetchFanTrackPlaylist, rewriteHlsPlaylist } from "@/lib/bunny-hls";

// Auth-gated HLS playlist endpoint. Validates session + token + grant, then
// fetches the raw playlist from Bunny (server-side via signed URL) and
// returns it with:
//   - Segment URIs rewritten to signed Bunny URLs (browser fetches them
//     directly from the CDN edge).
//   - EXT-X-KEY URI rewritten to /api/for-my-fans/[slug]/key so hls.js
//     loads the decryption key from this app, re-validating session + token.

export const dynamic = "force-dynamic";

const NOT_FOUND = Response.json({ error: "Not found" }, { status: 404 });

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!token) return NOT_FOUND;

  const session = await getCurrentSession();
  // Returning 404 (not 401) for every auth failure prevents probing —
  // attackers can't tell whether the slug, token, or session is the
  // problem.
  if (!session) return NOT_FOUND;

  const track = await findFanTrackBySlug(slug);
  if (!track || !track.is_published) return NOT_FOUND;

  const grant = await findGrantByToken(track.id, token);
  if (!grant) return NOT_FOUND;
  if (grant.audience_id !== session.audienceId) return NOT_FOUND;

  // Root-relative on purpose. Behind the le-nginx proxy, `url.origin` is the
  // container's internal bind address (https://0.0.0.0:3006), which the
  // browser cannot reach, so every playback failed after the move off
  // Vercel. Players resolve a relative EXT-X-KEY URI against the playlist
  // URL, so this always lands on the same origin as the page, which is also
  // what the session cookie needs.
  const keyUri = `/api/for-my-fans/${slug}/key?token=${encodeURIComponent(token)}`;

  let playlist: string;
  try {
    playlist = await fetchFanTrackPlaylist(track.hls_playlist_path);
  } catch (e) {
    console.error("[fan-tracks] failed to fetch playlist", e);
    return Response.json({ error: "Playlist unavailable" }, { status: 502 });
  }

  const rewritten = rewriteHlsPlaylist({
    playlist,
    playlistPath: track.hls_playlist_path,
    keyUri,
  });

  return new Response(rewritten, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.apple.mpegurl; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
