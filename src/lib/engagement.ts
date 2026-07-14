/* The engagement vocabulary, shared by the audience admin and the campaign
   targeting selector.

   These were previously two hand-maintained copies of the same list, which is
   how "medium" ended up offered as a campaign target that can never match
   anyone. One source now, so they cannot drift again.

   VALUES are what compute_engagement_score() writes to audience.engagement_score
   and what campaigns.ts passes to `.in("engagement_score", ...)`. Never show a
   raw value to a person -- run it through engagementLabel() first.

   The ladder, from the SQL function:

     unknown   emails_received = 0        we have never sent to them ("new")
     low       received 1-2, no click     too early to judge
     inactive  received 3+, no click      had a fair shot, did not take it
     high      clicked within 90 days     engaged

   "medium" is deliberately absent. The function can only assign it when
   audience.last_opened_at falls inside 90 days, and the Resend webhook
   deliberately never mirrors opens to the audience (opens are Apple-MPP noise;
   engagement is click-based by design). So it is unreachable and listing it
   only offers a filter that always returns zero rows. If opens are ever
   mirrored again, add it back here and nowhere else. */

export const ENGAGEMENT_LEVELS = ["high", "low", "inactive", "unknown"] as const;

export type EngagementLevel = (typeof ENGAGEMENT_LEVELS)[number];

/* Display labels. "unknown" reads as "new": the stored value says we have no
   measurement, but what that actually describes is someone who just arrived and
   has not been mailed yet. Renaming it in the DB would mean migrating
   compute_engagement_score plus every existing row, so the rename lives here. */
const LABELS: Record<string, string> = {
  high: "high",
  low: "low",
  inactive: "inactive",
  unknown: "new",
};

export function engagementLabel(value: string): string {
  return LABELS[value] ?? value;
}
