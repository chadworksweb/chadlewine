import "server-only";
import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase-server";

// Types + helpers for the "For my fans" gated-track system.
// See supabase/migrations/20260519130000_fan_tracks.sql for the schema
// and the /for-my-fans-01 page (src/app/(public)/for-my-fans-01/page.tsx)
// for the gate logic.

type SupabaseAdminClient = ReturnType<typeof createAdminClient>;

export interface FanTrack {
  id: string;
  slug: string;
  title: string;
  artist_credit: string;
  duration_seconds: number | null;
  cover_art_path: string | null;
  hls_playlist_path: string;
  hls_key_b64: string;
  eligibility_rule: EligibilityRule;
  is_published: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export type EligibilityRule =
  | { kind: "lifetime_orders_gte"; n: number }
  | { kind: "manual" };

export interface FanTrackGrant {
  id: string;
  fan_track_id: string;
  audience_id: string;
  token: string;
  granted_at: string;
  granted_via: "purchase" | "manual" | "backfill";
  invite_email_sent_at: string | null;
  first_played_at: string | null;
  last_played_at: string | null;
  play_count: number;
}

// 32 url-safe characters. randomBytes(24) → 32 base64url chars.
export function generateGrantToken(): string {
  return randomBytes(24)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Returns the existing grant for (track, audience), or mints a new one.
// Idempotent — safe to call repeatedly. Always returns the grant token.
export async function mintGrant(opts: {
  fan_track_id: string;
  audience_id: string;
  granted_via?: "purchase" | "manual" | "backfill";
}): Promise<FanTrackGrant> {
  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("fan_track_grants")
    .select("*")
    .eq("fan_track_id", opts.fan_track_id)
    .eq("audience_id", opts.audience_id)
    .maybeSingle();
  if (existing) return existing as FanTrackGrant;

  const token = generateGrantToken();
  const { data: inserted, error } = await supabase
    .from("fan_track_grants")
    .insert({
      fan_track_id: opts.fan_track_id,
      audience_id: opts.audience_id,
      token,
      granted_via: opts.granted_via ?? "purchase",
    })
    .select("*")
    .single();

  if (error || !inserted) {
    // Lost a race against another concurrent grantor — re-read.
    const { data: raced } = await supabase
      .from("fan_track_grants")
      .select("*")
      .eq("fan_track_id", opts.fan_track_id)
      .eq("audience_id", opts.audience_id)
      .maybeSingle();
    if (raced) return raced as FanTrackGrant;
    throw new Error(`mintGrant failed: ${error?.message ?? "unknown"}`);
  }

  await supabase.rpc("upsert_audience_event", {
    p_audience_id: opts.audience_id,
    p_event_type: "fan_track_granted",
    p_metadata: { fan_track_id: opts.fan_track_id, granted_via: opts.granted_via ?? "purchase" },
  });

  return inserted as FanTrackGrant;
}

// Mints grants for an audience on every currently-published fan_track. Called
// from upsertAudienceFromPurchase after every order — idempotent via the
// (fan_track_id, audience_id) unique constraint, so repeat callers no-op.
// Use this anywhere lifetime_orders increases.
export async function grantAllPublishedToAudience(audienceId: string): Promise<number> {
  const supabase = createAdminClient();
  const { data: tracks } = await supabase
    .from("fan_tracks")
    .select("id")
    .eq("is_published", true);
  if (!tracks || tracks.length === 0) return 0;

  let minted = 0;
  for (const t of tracks) {
    const before = await supabase
      .from("fan_track_grants")
      .select("id")
      .eq("fan_track_id", t.id)
      .eq("audience_id", audienceId)
      .maybeSingle();
    if (before.data) continue;
    await mintGrant({ fan_track_id: t.id, audience_id: audienceId, granted_via: "purchase" });
    minted += 1;
  }
  return minted;
}

// Mints grants for every audience with lifetime_orders >= 1 (or whatever
// the track's eligibility rule specifies) for the given track. Called from
// the publish action on the admin page and from scripts/backfill-fan-track-grants.ts.
export async function backfillGrantsForTrack(fanTrackId: string): Promise<number> {
  const supabase = createAdminClient();
  const { data: track } = await supabase
    .from("fan_tracks")
    .select("id, eligibility_rule")
    .eq("id", fanTrackId)
    .single();
  if (!track) throw new Error(`fan_track ${fanTrackId} not found`);

  const rule = track.eligibility_rule as EligibilityRule;
  if (rule.kind !== "lifetime_orders_gte") {
    // Manual-only rules don't backfill; the admin adds grants by hand.
    return 0;
  }

  const { data: eligible } = await supabase
    .from("audience")
    .select("id")
    .gte("lifetime_orders", rule.n);
  if (!eligible) return 0;

  let minted = 0;
  for (const a of eligible) {
    const before = await supabase
      .from("fan_track_grants")
      .select("id")
      .eq("fan_track_id", fanTrackId)
      .eq("audience_id", a.id)
      .maybeSingle();
    if (before.data) continue;
    await mintGrant({ fan_track_id: fanTrackId, audience_id: a.id, granted_via: "backfill" });
    minted += 1;
  }
  return minted;
}

// Lookup helpers.
export async function findFanTrackBySlug(slug: string): Promise<FanTrack | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("fan_tracks")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  return (data as FanTrack) ?? null;
}

export async function findGrantByToken(
  fanTrackId: string,
  token: string,
): Promise<FanTrackGrant | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("fan_track_grants")
    .select("*")
    .eq("fan_track_id", fanTrackId)
    .eq("token", token)
    .maybeSingle();
  return (data as FanTrackGrant) ?? null;
}

export async function listGrantsForAudience(audienceId: string): Promise<
  Array<FanTrackGrant & { fan_track: Pick<FanTrack, "slug" | "title" | "artist_credit" | "cover_art_path"> }>
> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("fan_track_grants")
    .select("*, fan_track:fan_tracks(slug, title, artist_credit, cover_art_path, is_published)")
    .eq("audience_id", audienceId)
    .order("granted_at", { ascending: false });
  if (!data) return [];
  // Drop grants whose track was unpublished after the fact.
  return (data as Array<FanTrackGrant & { fan_track: FanTrack & { is_published: boolean } }>)
    .filter((g) => g.fan_track.is_published);
}

// Increment play counters + emit a fan_track_played audience event.
// Called from the key API route on every key fetch — Chad opted for
// every-play logging in the eligibility interview.
export async function recordPlay(
  supabase: SupabaseAdminClient,
  grantId: string,
  audienceId: string,
  fanTrackId: string,
): Promise<void> {
  const now = new Date().toISOString();
  const { data: existing } = await supabase
    .from("fan_track_grants")
    .select("first_played_at, play_count")
    .eq("id", grantId)
    .single();
  if (!existing) return;

  await supabase
    .from("fan_track_grants")
    .update({
      first_played_at: existing.first_played_at ?? now,
      last_played_at: now,
      play_count: (existing.play_count ?? 0) + 1,
      updated_at: now,
    })
    .eq("id", grantId);

  await supabase.rpc("upsert_audience_event", {
    p_audience_id: audienceId,
    p_event_type: "fan_track_played",
    p_metadata: { fan_track_id: fanTrackId, grant_id: grantId },
  });
}
