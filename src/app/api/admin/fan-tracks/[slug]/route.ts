import { createAdminClient } from "@/lib/supabase-server";
import { backfillGrantsForTrack } from "@/lib/fan-tracks";

// Admin CRUD for an individual fan_track. PATCH supports flipping
// is_published + editing metadata; toggling to published triggers a
// backfill of grants for everyone meeting the eligibility rule.

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const supabase = createAdminClient();
  const { data: track } = await supabase
    .from("fan_tracks")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (!track) return Response.json({ error: "Not found" }, { status: 404 });

  const { data: grants } = await supabase
    .from("fan_track_grants")
    .select(
      "id, audience_id, token, granted_at, granted_via, invite_email_sent_at, first_played_at, last_played_at, play_count",
    )
    .eq("fan_track_id", track.id)
    .order("granted_at", { ascending: false });

  // Hydrate audience emails for display.
  const audienceIds = (grants || []).map((g) => g.audience_id);
  const audienceMap = new Map<string, { email: string; display_name: string | null; user_id: string | null }>();
  if (audienceIds.length > 0) {
    const { data: rows } = await supabase
      .from("audience")
      .select("id, email, display_name, user_id")
      .in("id", audienceIds);
    for (const r of rows || []) audienceMap.set(r.id, r);
  }

  return Response.json({
    track,
    grants: (grants || []).map((g) => ({
      ...g,
      audience: audienceMap.get(g.audience_id) ?? null,
    })),
  });
}

interface FanTrackPatch {
  title?: string;
  artist_credit?: string;
  duration_seconds?: number | null;
  cover_art_path?: string | null;
  eligibility_rule?: unknown;
  is_published?: boolean;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const supabase = createAdminClient();

  let body: FanTrackPatch;
  try {
    body = (await request.json()) as FanTrackPatch;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from("fan_tracks")
    .select("id, is_published")
    .eq("slug", slug)
    .maybeSingle();
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.title !== undefined) updates.title = body.title;
  if (body.artist_credit !== undefined) updates.artist_credit = body.artist_credit;
  if (body.duration_seconds !== undefined) updates.duration_seconds = body.duration_seconds;
  if (body.cover_art_path !== undefined) updates.cover_art_path = body.cover_art_path;
  if (body.eligibility_rule !== undefined) updates.eligibility_rule = body.eligibility_rule;
  if (body.is_published !== undefined) {
    updates.is_published = body.is_published;
    if (body.is_published && !existing.is_published) {
      updates.published_at = new Date().toISOString();
    }
  }

  const { error } = await supabase.from("fan_tracks").update(updates).eq("id", existing.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Publish toggle 0 -> 1 triggers grant backfill for every eligible audience.
  let backfilled = 0;
  if (body.is_published && !existing.is_published) {
    backfilled = await backfillGrantsForTrack(existing.id);
  }

  return Response.json({ ok: true, backfilled });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const supabase = createAdminClient();
  // Cascade deletes grants via the FK in the migration.
  const { error } = await supabase.from("fan_tracks").delete().eq("slug", slug);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
