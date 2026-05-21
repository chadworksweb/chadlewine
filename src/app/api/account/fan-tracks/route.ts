import { getCurrentSession } from "@/lib/account";
import { listGrantsForAudience } from "@/lib/fan-tracks";

// Returns the signed-in fan's grants on currently-published fan_tracks.
// Powers the "For My Fans" card on /account.

export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const grants = await listGrantsForAudience(session.audienceId);
  return Response.json({
    items: grants.map((g) => ({
      grant_id: g.id,
      slug: g.fan_track.slug,
      title: g.fan_track.title,
      artist_credit: g.fan_track.artist_credit,
      cover_art_path: g.fan_track.cover_art_path,
      url: `/${g.fan_track.slug}?token=${encodeURIComponent(g.token)}`,
      granted_at: g.granted_at,
      first_played_at: g.first_played_at,
    })),
  });
}
