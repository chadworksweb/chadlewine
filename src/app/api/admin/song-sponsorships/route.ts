import { createAdminClient } from "@/lib/supabase-server";

// Goal rules (cents): beat is fixed at $250; full has floors by mode.
const BEAT_GOAL_CENTS = 25000;
const FULL_REMOTE_FLOOR_CENTS = 200000; // $2000
const FULL_STUDIO_FLOOR_CENTS = 500000; // $5000

type GoalCheck = { ok: true; goal: number } | { ok: false; error: string };

function resolveGoal(
  production_type: string,
  production_mode: string | null,
  requestedGoal: number | null,
): GoalCheck {
  if (production_type === "beat") {
    if (production_mode) return { ok: false, error: "Beat sponsorships have no mode." };
    return { ok: true, goal: BEAT_GOAL_CENTS };
  }
  if (production_type === "full") {
    if (production_mode !== "remote" && production_mode !== "studio") {
      return { ok: false, error: "Full production needs a mode (remote or studio)." };
    }
    const floor = production_mode === "studio" ? FULL_STUDIO_FLOOR_CENTS : FULL_REMOTE_FLOOR_CENTS;
    const goal = requestedGoal ?? floor;
    if (goal < floor) {
      return { ok: false, error: `Goal must be at least $${(floor / 100).toFixed(0)} for ${production_mode} full production.` };
    }
    return { ok: true, goal };
  }
  return { ok: false, error: "Invalid production type." };
}

// GET ?song_id= -> the sponsorship config (incl. internal cost) + contributions.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const songId = searchParams.get("song_id");
  if (!songId) return Response.json({ error: "song_id required" }, { status: 400 });

  const supabase = createAdminClient();
  const { data: sponsorship, error } = await supabase
    .from("song_sponsorships")
    .select("*")
    .eq("song_id", songId)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  let contributions: unknown[] = [];
  if (sponsorship) {
    const { data: rows } = await supabase
      .from("sponsor_contributions")
      .select("id, amount_cents, credit_name, is_anonymous, request_note, created_at, audience:audience_id(email, display_name)")
      .eq("sponsorship_id", sponsorship.id)
      .order("created_at", { ascending: false });
    contributions = rows || [];
  }

  return Response.json({ sponsorship: sponsorship || null, contributions });
}

// POST -> create the sponsorship config for a song. Type + mode are locked here
// for the life of the sponsorship. Also flips the song to a sponsor demo.
export async function POST(request: Request) {
  const supabase = createAdminClient();
  const body = await request.json().catch(() => null);
  const songId: string | undefined = body?.song_id;
  const production_type: string = body?.production_type;
  const production_mode: string | null = body?.production_mode ?? null;

  if (!songId) return Response.json({ error: "song_id required" }, { status: 400 });

  const check = resolveGoal(production_type, production_mode, body?.goal_cents ?? null);
  if (!check.ok) return Response.json({ error: check.error }, { status: 400 });

  const { data: existing } = await supabase
    .from("song_sponsorships")
    .select("id")
    .eq("song_id", songId)
    .maybeSingle();
  if (existing) {
    return Response.json({ error: "This song already has a sponsorship." }, { status: 409 });
  }

  const { data, error } = await supabase
    .from("song_sponsorships")
    .insert({
      song_id: songId,
      production_type,
      production_mode: production_type === "beat" ? null : production_mode,
      goal_cents: check.goal,
      cost_cents: body?.cost_cents ?? null,
      early_access_note: body?.early_access_note ?? null,
    })
    .select()
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // The SongEditor form owns songs.status / songs.demo_type (autosave), so we
  // don't touch them here -- the panel only exists once the song is already a
  // sponsor demo.
  return Response.json(data, { status: 201 });
}

// PUT -> update mutable fields. Type/mode never change. Goal only editable while
// nothing has been raised yet (and never for beat). Status moves the production
// forward (open -> funded -> in_production -> released).
export async function PUT(request: Request) {
  const supabase = createAdminClient();
  const body = await request.json().catch(() => null);
  const songId: string | undefined = body?.song_id;
  if (!songId) return Response.json({ error: "song_id required" }, { status: 400 });

  const { data: current } = await supabase
    .from("song_sponsorships")
    .select("*")
    .eq("song_id", songId)
    .maybeSingle();
  if (!current) return Response.json({ error: "Sponsorship not found." }, { status: 404 });

  const update: Record<string, unknown> = {};

  if (typeof body.cost_cents !== "undefined") update.cost_cents = body.cost_cents;
  if (typeof body.early_access_note !== "undefined") update.early_access_note = body.early_access_note;
  if (typeof body.enabled === "boolean") update.enabled = body.enabled;

  if (typeof body.goal_cents !== "undefined" && current.production_type !== "beat") {
    if (current.raised_cents > 0) {
      return Response.json({ error: "Goal is locked once contributions have started." }, { status: 409 });
    }
    const check = resolveGoal(current.production_type, current.production_mode, body.goal_cents);
    if (!check.ok) return Response.json({ error: check.error }, { status: 400 });
    update.goal_cents = check.goal;
  }

  if (typeof body.status === "string") {
    if (!["open", "funded", "in_production", "released"].includes(body.status)) {
      return Response.json({ error: "Invalid status." }, { status: 400 });
    }
    update.status = body.status;
  }

  if (Object.keys(update).length === 0) return Response.json(current);

  const { data, error } = await supabase
    .from("song_sponsorships")
    .update(update)
    .eq("song_id", songId)
    .select()
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

// DELETE ?song_id= -> remove the sponsorship config. Blocked once anything has
// been raised (funds are non-refundable; the record must stay).
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const songId = searchParams.get("song_id");
  if (!songId) return Response.json({ error: "song_id required" }, { status: 400 });

  const supabase = createAdminClient();
  const { data: current } = await supabase
    .from("song_sponsorships")
    .select("id, raised_cents")
    .eq("song_id", songId)
    .maybeSingle();
  if (!current) return Response.json({ ok: true });
  if (current.raised_cents > 0) {
    return Response.json({ error: "Cannot delete a sponsorship that has raised funds." }, { status: 409 });
  }

  const { error } = await supabase.from("song_sponsorships").delete().eq("song_id", songId);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
