/** Sovereignty Audit billing math. Single source of the rate -- the page, the
   hold checkout, the settle route, and the admin confirm all read from here.
   The same $5.25/min rate is stated on chadworks.co (RatesCapsule.tsx); if it
   moves, it moves in both places. */

/** $5.25/min, in cents. Same rate chadworks bills development at. */
export const AUDIT_RATE_CENTS_PER_MIN = 525;

/** Launch pricing: 50% off -> 262.5 cents/min. */
export const AUDIT_LAUNCH_MULTIPLIER = 0.5;

/** Is launch pricing still on? The one flip point -- no end date is set yet.
   Flipping this only affects NEW holds: every row snapshots its own
   launch_discount at hold time, so sessions already sold settle at the rate
   they were sold at. */
export const AUDIT_LAUNCH_ACTIVE = true;

/** Hard ceiling. Billing stops here no matter how long the call ran. */
export const AUDIT_MAX_MINUTES = 120;

/** Paid up front to hold the spot. Counts toward the total, not on top of it. */
export const AUDIT_HOLD_MINUTES = 10;

/** Courtesy marks Chad calls during the session. The client tracks
   their own time (see the agreement) -- these are not a system, and nothing in
   the app fires on them. Here so the agreement copy and the admin timer read
   the same numbers. */
export const AUDIT_CALLOUT_MINUTES = [25, 55] as const;

export function auditRateCentsPerMin(launch: boolean): number {
  return AUDIT_RATE_CENTS_PER_MIN * (launch ? AUDIT_LAUNCH_MULTIPLIER : 1);
}

/** Total for a session of `minutes`, in cents.

   Whole minutes, rounded up from elapsed time, capped at the ceiling. At the
   launch rate an odd minute count lands on a half cent (37 * 262.5 = 9712.5),
   so round once at the total and never per minute. 262.5 is exactly
   representable in binary floating point, so the multiply is exact for integer
   minutes and Math.round takes the half up. */
export function auditTotalCents(minutes: number, launch: boolean): number {
  const billable = Math.min(Math.max(Math.ceil(minutes), 0), AUDIT_MAX_MINUTES);
  return Math.round(billable * auditRateCentsPerMin(launch));
}

/** What the client pays up front to hold the spot. */
export function auditHoldCents(launch: boolean): number {
  return auditTotalCents(AUDIT_HOLD_MINUTES, launch);
}

/** What gets auto-charged when the session ends. Never negative: a session that
   ends at or under the hold window settles at zero, it does not refund. */
export function auditBalanceCents(minutes: number, launch: boolean): number {
  return Math.max(0, auditTotalCents(minutes, launch) - auditHoldCents(launch));
}

/** Whole minutes billed for a run, rounded up and capped. Exported so the admin
   timer and the settle route agree on the number. */
export function auditBilledMinutes(startedAt: Date, endedAt: Date): number {
  const elapsedMs = endedAt.getTime() - startedAt.getTime();
  const minutes = Math.ceil(elapsedMs / 60_000);
  return Math.min(Math.max(minutes, 0), AUDIT_MAX_MINUTES);
}

/** Cents -> "$157.50". Used on the page, the agreement, and the admin confirm. */
export function formatAuditCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
