import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase-server";
import { findAudienceByUserId } from "@/lib/audience";
import { grantStoreCoupon } from "@/lib/grant-coupon";

/* Transcend the Machine - persistence layer (design doc Section 11).
   tm_progress holds one row per player: signed-in play keys by audience_id,
   anon play by a client session id. All access is server-side via the service
   role (the tables have RLS on with no public policies), mirroring tm_truths. */

export type TmInventory = { key?: boolean; rune?: boolean };

export interface TmProgress {
  current_level: number;
  inventory: TmInventory;
  completed: boolean;
  secret_found: boolean;
  secret_unlocked: boolean;
}

export interface TmActor {
  userId: string;
  email: string | null;
  audienceId: string | null;
}

/* Resolve a signed-in player from their sb-access-token. Returns null for anon.
   audienceId is the contact record (present for essentially every signed-in
   fan); email falls back to the auth email so the completion coupon can still
   resolve-or-create the audience row by email if no row exists yet. */
export async function resolveActor(token: string | undefined): Promise<TmActor | null> {
  if (!token) return null;
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  const audience = await findAudienceByUserId(data.user.id);
  return {
    userId: data.user.id,
    email: audience?.email ?? data.user.email ?? null,
    audienceId: audience?.id ?? null,
  };
}

type ProgressRow = {
  current_level: number | null;
  inventory: TmInventory | null;
  completed: boolean | null;
  secret_found: boolean | null;
  secret_unlocked: boolean | null;
};

function shape(row: ProgressRow | null): TmProgress | null {
  if (!row) return null;
  return {
    current_level: row.current_level ?? 1,
    inventory: row.inventory ?? {},
    completed: !!row.completed,
    secret_found: !!row.secret_found,
    secret_unlocked: !!row.secret_unlocked,
  };
}

const COLS = "current_level, inventory, completed, secret_found, secret_unlocked";

/* Read the player's row. Signed-in players read by audience_id; if they have no
   audience-keyed row yet but pass a session id (played anon first), fall back to
   that so their earlier progress still surfaces. */
export async function getProgress(actor: TmActor | null, sessionId: string | null): Promise<TmProgress | null> {
  const admin = createAdminClient();
  if (actor?.audienceId) {
    const { data } = await admin.from("tm_progress").select(COLS).eq("audience_id", actor.audienceId).maybeSingle();
    if (data) return shape(data as ProgressRow);
  }
  if (sessionId) {
    const { data } = await admin
      .from("tm_progress")
      .select(COLS)
      .eq("session_id", sessionId)
      .is("audience_id", null)
      .maybeSingle();
    return shape((data as ProgressRow) ?? null);
  }
  return null;
}

/* Locate the existing row id for this actor/session, if any. */
async function findRowId(
  admin: ReturnType<typeof createAdminClient>,
  actor: TmActor | null,
  sessionId: string | null,
): Promise<string | null> {
  if (actor?.audienceId) {
    const { data } = await admin.from("tm_progress").select("id").eq("audience_id", actor.audienceId).maybeSingle();
    if (data) return data.id;
  }
  if (sessionId) {
    const { data } = await admin
      .from("tm_progress")
      .select("id")
      .eq("session_id", sessionId)
      .is("audience_id", null)
      .maybeSingle();
    if (data) return data.id;
  }
  return null;
}

/* Save furthest level + current inventory. current_level only moves forward
   (so switching back to L1 mid-session never regresses the saved furthest
   point). Select-then-write keyed by audience_id or session_id; low write rate,
   so no upsert-on-conflict needed. */
export async function saveProgress(opts: {
  actor: TmActor | null;
  sessionId: string | null;
  currentLevel: number;
  inventory: TmInventory;
}): Promise<void> {
  const { actor, sessionId, currentLevel, inventory } = opts;
  if (!actor?.audienceId && !sessionId) return; // nothing to key on
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const level = Math.max(1, Math.min(5, Math.floor(currentLevel) || 1));

  const { data: existing } = actor?.audienceId
    ? await admin.from("tm_progress").select("id, current_level").eq("audience_id", actor.audienceId).maybeSingle()
    : await admin
        .from("tm_progress")
        .select("id, current_level")
        .eq("session_id", sessionId as string)
        .is("audience_id", null)
        .maybeSingle();

  if (existing) {
    await admin
      .from("tm_progress")
      .update({
        current_level: Math.max(existing.current_level ?? 1, level),
        inventory,
        session_id: sessionId ?? null,
        updated_at: now,
      })
      .eq("id", existing.id);
    return;
  }

  const { error } = await admin.from("tm_progress").insert({
    audience_id: actor?.audienceId ?? null,
    session_id: sessionId ?? null,
    current_level: level,
    inventory,
  });
  // A concurrent insert may have won the unique index; ignore that (the row now
  // exists, and the next save will update it).
  if (error && !/duplicate key|unique/i.test(error.message)) {
    throw new Error(`tm_progress save failed: ${error.message}`);
  }
}

export interface CompleteResult {
  ok: true;
  alreadyCompleted: boolean;
  couponCode: string | null;
}

/* Mark the journey complete (L5 transcended). Idempotent: if already flagged,
   does nothing further (no duplicate coupon email, no duplicate timeline event).
   Signed-in players get the merch coupon + a `transcend_completed` audience
   event (the pixel-wall feed). Anon players just get the completed flag. */
export async function markComplete(opts: {
  actor: TmActor | null;
  sessionId: string | null;
}): Promise<CompleteResult> {
  const { actor, sessionId } = opts;
  const admin = createAdminClient();
  const now = new Date().toISOString();

  const rowId = await findRowId(admin, actor, sessionId);

  // Idempotency: if the row is already completed, stop here.
  if (rowId) {
    const { data: row } = await admin.from("tm_progress").select("completed").eq("id", rowId).maybeSingle();
    if (row?.completed) return { ok: true, alreadyCompleted: true, couponCode: null };
    await admin
      .from("tm_progress")
      .update({ completed: true, completed_at: now, current_level: 5, updated_at: now })
      .eq("id", rowId);
  } else if (actor?.audienceId || sessionId) {
    await admin.from("tm_progress").insert({
      audience_id: actor?.audienceId ?? null,
      session_id: sessionId ?? null,
      current_level: 5,
      completed: true,
      completed_at: now,
    });
  }

  let couponCode: string | null = null;
  if (actor?.email) {
    // Merch reward. grantStoreCoupon dedups per (audience, source), so this is
    // safe even if the completed-flag write raced. Percent/expiry are a
    // reasonable default for the reward; adjust to taste.
    try {
      const granted = await grantStoreCoupon({
        email: actor.email,
        source: "transcend_complete",
        percentOff: 15,
        daysValid: 30,
        emailSubject: "You outgrew the machine",
        eyebrow: "TRANSCEND THE MACHINE",
        headline: "You made it out",
        intro:
          "You used your own voice to dissolve the last of it, and the light flooded in. Here is something to carry out with you: 15% off in the store.",
        redeemNote: "Sign in and the discount waits in your cart, on music or one merch piece.",
        footerNote: "Good for 30 days. One per person.",
        ctaUrl: "/music",
        ctaLabel: "Spend it on the music",
      });
      couponCode = granted?.code ?? null;
    } catch {
      // Coupon failure must not break completion.
    }

    // Pixel-wall feed: log the completion on the audience timeline.
    if (actor.audienceId) {
      await admin
        .rpc("upsert_audience_event", {
          p_audience_id: actor.audienceId,
          p_event_type: "transcend_completed",
          p_metadata: { source: "transcend-the-machine" },
        })
        .then(undefined, () => {
          /* non-fatal */
        });
    }
  }

  return { ok: true, alreadyCompleted: false, couponCode };
}
