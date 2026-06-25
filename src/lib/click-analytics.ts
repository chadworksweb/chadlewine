// Human-vs-scanner click analysis for campaign click metrics.
//
// Resend routes every tracked click through Amazon CloudFront, so the click
// user-agent is "Amazon CloudFront" for humans AND scanners alike -- it cannot
// tell them apart. What DOES separate them is timing:
//
//   - A mail-security gateway pre-fetches a message's links the instant it is
//     delivered, firing several clicks to one recipient within a second or two.
//   - A human clicks one or a few links, spread over seconds, minutes, or hours.
//
// So a click is treated as a scanner click when its recipient (campaign_send)
// produced BURST_MIN+ clicks inside a BURST_WINDOW_MS sliding window. Genuine
// non-CloudFront scanner/fetcher user-agents (curl, Proofpoint, ...) are still
// dropped up front via isLikelyBotUserAgent.

import { isLikelyBotUserAgent, isLikelyDatacenterIp } from "@/lib/bot-detection";

export interface ClickEvent {
  campaign_send_id: string | null;
  url: string | null;
  user_agent: string | null;
  ip_address: string | null;
  created_at: string;
}

// Burst backstop for scanners that sit on ISP-looking IPs (the datacenter-IP
// check in bot-detection catches cloud gateways directly). 2+ clicks to one
// recipient within the window reads as a gateway pre-fetch storm, not a person:
// real readers in the data click a single link. Window is wide enough to span
// a storm whose clicks dribble out over a minute or two. Exported so the Resend
// webhook applies the SAME threshold in real time.
export const CLICK_BURST_MIN = 2;
export const CLICK_BURST_WINDOW_MS = 120000;

function ts(iso: string): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

/** Returns the subset of click events that look like real human clicks --
    genuine-bot UAs removed, then per-recipient burst storms removed. */
export function filterHumanClicks<T extends ClickEvent>(events: T[]): T[] {
  // 1. Drop clearly non-human fetchers by UA (curl, Proofpoint, etc.) and any
  //    click from a cloud/datacenter IP (Microsoft 365 / ATP Safe Links etc.).
  const byUa = events.filter(
    (e) => !isLikelyBotUserAgent(e.user_agent) && !isLikelyDatacenterIp(e.ip_address)
  );

  // 2. Drop burst clusters per recipient (gateway pre-fetch storms).
  const bySend = new Map<string, T[]>();
  for (const e of byUa) {
    const key = e.campaign_send_id ?? "";
    let arr = bySend.get(key);
    if (!arr) {
      arr = [];
      bySend.set(key, arr);
    }
    arr.push(e);
  }

  const human: T[] = [];
  for (const group of bySend.values()) {
    const sorted = [...group].sort((a, b) => ts(a.created_at) - ts(b.created_at));
    for (let i = 0; i < sorted.length; i++) {
      const t = ts(sorted[i].created_at);
      // Cluster size = events on this recipient within +/- the burst window.
      let n = 0;
      for (let j = 0; j < sorted.length; j++) {
        if (Math.abs(ts(sorted[j].created_at) - t) <= CLICK_BURST_WINDOW_MS) n++;
      }
      if (n < CLICK_BURST_MIN) human.push(sorted[i]);
    }
  }
  return human;
}

export interface ClickSummary {
  // distinct (recipient, link) among human clicks
  uniqueLinkClicks: number;
  // every human click event
  totalClicks: number;
  // human click count per campaign_send id (for the per-recipient column)
  bySend: Record<string, number>;
}

export function summarizeHumanClicks(events: ClickEvent[]): ClickSummary {
  const human = filterHumanClicks(events);
  const seen = new Set<string>();
  const bySend: Record<string, number> = {};
  for (const e of human) {
    seen.add(`${e.campaign_send_id ?? ""}|${e.url ?? ""}`);
    const k = e.campaign_send_id ?? "";
    if (k) bySend[k] = (bySend[k] ?? 0) + 1;
  }
  return { uniqueLinkClicks: seen.size, totalClicks: human.length, bySend };
}
