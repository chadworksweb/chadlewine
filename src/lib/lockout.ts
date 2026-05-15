import { createAdminClient } from "@/lib/supabase-server";

const LOCK_THRESHOLD = 10;          // failures before lockout
const LOCK_DURATION_MIN = 60;       // 1 hour
const FAILURE_WINDOW_HOURS = 24;    // count resets if no failure in 24h

interface LockoutState {
  locked: boolean;
  until?: Date;
  retryAfter?: number; // seconds
}

export async function checkLockout(email: string): Promise<LockoutState> {
  if (!email) return { locked: false };
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("user_lockouts")
    .select("locked_until")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  if (!data || !data.locked_until) return { locked: false };
  const until = new Date(data.locked_until);
  if (until.getTime() <= Date.now()) return { locked: false };
  return {
    locked: true,
    until,
    retryAfter: Math.ceil((until.getTime() - Date.now()) / 1000),
  };
}

/** Bump failure counter on a missed login. If the counter crosses
   LOCK_THRESHOLD, set locked_until = now + LOCK_DURATION_MIN. */
export async function recordFailure(email: string): Promise<{ lockedNow: boolean }> {
  if (!email) return { lockedNow: false };
  const supabase = createAdminClient();
  const lcEmail = email.toLowerCase();
  const now = new Date();
  const windowAgo = new Date(now.getTime() - FAILURE_WINDOW_HOURS * 3600 * 1000);

  const { data: existing } = await supabase
    .from("user_lockouts")
    .select("failed_count, last_failure_at, locked_until")
    .eq("email", lcEmail)
    .maybeSingle();

  // Reset count if last failure was outside the window.
  const baseCount =
    existing && existing.last_failure_at && new Date(existing.last_failure_at) > windowAgo
      ? existing.failed_count
      : 0;
  const newCount = baseCount + 1;
  const lockedNow = newCount >= LOCK_THRESHOLD;
  const lockedUntil = lockedNow
    ? new Date(now.getTime() + LOCK_DURATION_MIN * 60 * 1000).toISOString()
    : null;

  await supabase.from("user_lockouts").upsert({
    email: lcEmail,
    failed_count: newCount,
    last_failure_at: now.toISOString(),
    locked_until: lockedNow ? lockedUntil : existing?.locked_until ?? null,
  });

  return { lockedNow };
}

export async function clearLockout(email: string): Promise<void> {
  if (!email) return;
  const supabase = createAdminClient();
  await supabase
    .from("user_lockouts")
    .update({ failed_count: 0, locked_until: null })
    .eq("email", email.toLowerCase());
}
