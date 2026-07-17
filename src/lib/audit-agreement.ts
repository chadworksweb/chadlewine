/** The agreement shown at the hold step and stored on the row.

   This is not boilerplate. It is the only place the client is told that the
   clock is theirs to watch, so it has to be on the page and checked before the
   hold button does anything. Version it: the rate changes when launch pricing
   ends, and a priced consent needs a record of which wording was agreed to. */

import {
  AUDIT_CALLOUT_MINUTES,
  AUDIT_HOLD_MINUTES,
  AUDIT_MAX_MINUTES,
  auditHoldCents,
  auditRateCentsPerMin,
  auditTotalCents,
  formatAuditCents,
} from "@/lib/audit-rate";

/** Bump on ANY wording or rate change. Stored as agreement_version. */
export const AUDIT_AGREEMENT_VERSION = "2026-07-16.1";

/** Per-minute rate as exact dollars. The launch rate is 262.5 cents, which is
   two and a half cents -- write it out rather than rounding to $2.63, because
   this is the number the client is agreeing to be billed at. */
function rateLabel(launch: boolean): string {
  const cents = auditRateCentsPerMin(launch);
  const dollars = cents / 100;
  // 5.25 -> "$5.25"; 2.625 -> "$2.625"
  const text = Number.isInteger(cents)
    ? dollars.toFixed(2)
    : String(dollars);
  return `$${text}`;
}

export function auditAgreementTerms(launch: boolean): string[] {
  const [firstCall, secondCall] = AUDIT_CALLOUT_MINUTES;
  const hold = formatAuditCents(auditHoldCents(launch));
  const hourExample = formatAuditCents(auditTotalCents(60, launch));
  const ceiling = formatAuditCents(auditTotalCents(AUDIT_MAX_MINUTES, launch));

  return [
    `The ${AUDIT_HOLD_MINUTES} minutes you are paying for now (${hold}) holds your session and counts toward your total. It is not a fee on top of it.`,

    launch
      ? `Past those ${AUDIT_HOLD_MINUTES} minutes, time bills at ${rateLabel(true)} a minute. That is $5.25 with the launch discount taking half of it off. An hour comes to ${hourExample}.`
      : `Past those ${AUDIT_HOLD_MINUTES} minutes, time bills at ${rateLabel(false)} a minute, the same rate my development work bills at. An hour comes to ${hourExample}.`,

    `You track your own time. There is no clock on your screen and nothing counting down in front of you. I will say something when you hit the ${firstCall} minute mark and again at ${secondCall}, but those are courtesy markers and not something to lean on.`,

    `The session ends when you say it ends. ${AUDIT_MAX_MINUTES} minutes is the ceiling, and billing stops there no matter what (${ceiling}).`,

    `When the session ends, the balance is charged to the card you are using right now. If that charge does not go through, you get an invoice instead and the balance is due within 24 hours.`,

    `The ${AUDIT_HOLD_MINUTES}-minute hold is non-refundable.`,
  ];
}

/** Chad's line, verbatim. Sits under the terms as the plain-language version of
   the "session ends when you say it ends" term. Do not restructure this. */
export const AUDIT_EXIT_LINE =
  "Don't feel like it's working for you? Don't want to go that deep? Just say so and we end the session. Balance is due within 24 hours.";
