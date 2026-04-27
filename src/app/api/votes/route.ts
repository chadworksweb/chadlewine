import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase-server";

const VOTER_COOKIE = "cl_voter_id";
const ACTIVATION_TYPES = ["free", "payment", "share", "other"] as const;
type ActivationType = (typeof ACTIVATION_TYPES)[number];

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const songId: unknown = body.song_id;
  const activationType: unknown = body.activation_type;
  const activationPayload: unknown = body.activation_payload;

  if (typeof songId !== "string" || !songId) {
    return Response.json({ error: "song_id required" }, { status: 400 });
  }
  if (!ACTIVATION_TYPES.includes(activationType as ActivationType)) {
    return Response.json({ error: "invalid activation_type" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Votes are only meaningful on demos.
  const { data: song, error: songErr } = await supabase
    .from("songs")
    .select("id, status, demo_vote_count, demo_investment_score, demo_surfaced")
    .eq("id", songId)
    .single();
  if (songErr || !song) {
    return Response.json({ error: "song not found" }, { status: 404 });
  }
  if (song.status !== "demo") {
    return Response.json({ error: "voting only on demos" }, { status: 400 });
  }

  // Resolve voter_id from cookie or mint a new one.
  const cookieStore = await cookies();
  let voterId = cookieStore.get(VOTER_COOKIE)?.value || null;
  let setCookie = false;
  if (!voterId) {
    voterId = crypto.randomUUID();
    setCookie = true;
  }

  // Vote index = existing votes by this voter on this song + 1
  const { count: existingCount, error: countErr } = await supabase
    .from("song_votes")
    .select("id", { count: "exact", head: true })
    .eq("song_id", songId)
    .eq("voter_id", voterId);
  if (countErr) {
    return Response.json({ error: countErr.message }, { status: 500 });
  }
  const voteIndex = (existingCount ?? 0) + 1;

  // Mirror the DB CHECK so we return a clean error instead of a constraint violation.
  if (voteIndex === 1 && activationType !== "free") {
    return Response.json(
      { error: "first vote must be free" },
      { status: 400 },
    );
  }
  if (voteIndex >= 2 && activationType === "free") {
    return Response.json(
      { error: "additional votes require investment", vote_index: voteIndex },
      { status: 402 },
    );
  }

  const { error: insertErr } = await supabase.from("song_votes").insert({
    song_id: songId,
    voter_id: voterId,
    vote_index: voteIndex,
    activation_type: activationType,
    activation_payload: activationPayload ?? null,
  });
  if (insertErr) {
    return Response.json({ error: insertErr.message }, { status: 500 });
  }

  // Re-read aggregates so the client can update without a page refresh.
  const { data: updated } = await supabase
    .from("songs")
    .select("demo_vote_count, demo_investment_score")
    .eq("id", songId)
    .single();

  if (setCookie) {
    cookieStore.set(VOTER_COOKIE, voterId, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365 * 5, // 5 years
      sameSite: "lax",
      httpOnly: true,
    });
  }

  return Response.json({
    vote_index: voteIndex,
    demo_vote_count: updated?.demo_vote_count ?? null,
    demo_investment_score: updated?.demo_investment_score ?? null,
  });
}
