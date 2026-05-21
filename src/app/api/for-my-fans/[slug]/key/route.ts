import { createAdminClient } from "@/lib/supabase-server";
import { getCurrentSession } from "@/lib/account";
import {
  findFanTrackBySlug,
  findGrantByToken,
  recordPlay,
} from "@/lib/fan-tracks";

// Auth-gated AES-128 key endpoint. hls.js fetches this on each playback to
// get the 16-byte symmetric key referenced by the rewritten EXT-X-KEY URI
// in the playlist. Every request re-validates session + token + grant, so
// a leaked URL is useless to an unauthenticated client.
//
// Side effect: increments play_count and emits a fan_track_played
// audience event. Chad opted for every-play logging (not first-only) in
// the eligibility interview.

export const dynamic = "force-dynamic";

const NOT_FOUND = new Response("Not found", { status: 404 });

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!token) return NOT_FOUND;

  const session = await getCurrentSession();
  if (!session) return NOT_FOUND;

  const track = await findFanTrackBySlug(slug);
  if (!track || !track.is_published) return NOT_FOUND;

  const grant = await findGrantByToken(track.id, token);
  if (!grant) return NOT_FOUND;
  if (grant.audience_id !== session.audienceId) return NOT_FOUND;

  // Decode the AES key to raw 16 bytes.
  const keyBytes = Buffer.from(track.hls_key_b64, "base64");
  if (keyBytes.length !== 16) {
    console.error("[fan-tracks] invalid key length", slug, keyBytes.length);
    return new Response("Server misconfiguration", { status: 500 });
  }

  // Fire-and-forget play tracking. Don't block the key response on it.
  void recordPlay(createAdminClient(), grant.id, grant.audience_id, track.id);

  return new Response(keyBytes, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": "16",
      // hls.js fetches this with credentials; CORS not needed since same
      // origin as the page. Cache MUST be off so admin revocation works.
      "Cache-Control": "no-store",
    },
  });
}
