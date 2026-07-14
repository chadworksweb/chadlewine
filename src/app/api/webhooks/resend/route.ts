import { Webhook } from "svix";
import { createAdminClient } from "@/lib/supabase-server";
import { isLikelyBotUserAgent, isLikelyDatacenterIp } from "@/lib/bot-detection";
import {
  CLICK_BURST_MIN,
  CLICK_BURST_WINDOW_MS,
  SOFT_BOUNCE_LIMIT,
  isListManagementLink,
} from "@/lib/click-analytics";

/* Resend → Svix webhook handler.

   Resend signs each webhook with a Svix-compatible secret you'll set in
   RESEND_WEBHOOK_SECRET. The Svix client validates the headers and throws
   on mismatch. After verification we:
     1. find the matching campaign_sends row via resend_id (email_id)
     2. insert a campaign_events audit row
     3. bump the aggregate counters on campaign_sends and campaigns
   so the admin can read open/click stats without re-aggregating.

   We use the raw text body for signature verification (Svix is strict)
   and then JSON.parse it ourselves.
*/

interface ResendEventBase {
  type: string;
  created_at: string;
  data: {
    email_id: string;
    created_at?: string;
    to?: string[];
    from?: string;
    subject?: string;
  } & Record<string, unknown>;
}

export async function POST(request: Request) {
  const body = await request.text();
  const secret = process.env.RESEND_WEBHOOK_SECRET;

  if (!secret) {
    console.error("[resend webhook] RESEND_WEBHOOK_SECRET not set");
    return Response.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return Response.json({ error: "Missing Svix headers" }, { status: 400 });
  }

  let event: ResendEventBase;
  try {
    const wh = new Webhook(secret);
    event = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as ResendEventBase;
  } catch (e) {
    console.error("[resend webhook] signature verification failed", e);
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const emailId = event.data?.email_id;
  if (!emailId) {
    // No way to attribute — log and acknowledge.
    return Response.json({ ok: true, unmatched: true });
  }

  // Resolve the send row this event belongs to.
  const { data: sendRow } = await supabase
    .from("campaign_sends")
    .select("id, campaign_id, subscriber_id, audience_id")
    .eq("resend_id", emailId)
    .maybeSingle();

  // Common event-row payload — written even if there's no matching send
  // (lets us debug stray events later without losing data).
  const eventType = event.type.replace(/^email\./, ""); // "email.opened" → "opened"
  const data = event.data as Record<string, unknown>;
  const clickInfo = (data.click ?? {}) as Record<string, unknown>;
  const bounceInfo = (data.bounce ?? {}) as Record<string, unknown>;
  // Resend marks bounces "Permanent" (hard) or "Transient" (soft). Soft bounces
  // are temporary (full mailbox, server down) and must NOT unsubscribe anyone;
  // only hard/undetermined bounces trigger the scrub.
  const bounceTypeRaw =
    typeof bounceInfo.type === "string" ? (bounceInfo.type as string).toLowerCase() : "";
  const bounceIsSoft = bounceTypeRaw.includes("transient") || bounceTypeRaw === "soft";
  const bounceFlag = bounceIsSoft
    ? "soft"
    : bounceTypeRaw.includes("permanent") || bounceTypeRaw === "hard"
      ? "hard"
      : "undetermined";
  const url = typeof clickInfo.link === "string" ? (clickInfo.link as string) : null;
  const userAgent =
    typeof clickInfo.userAgent === "string"
      ? (clickInfo.userAgent as string)
      : typeof data.user_agent === "string"
        ? (data.user_agent as string)
        : null;
  const ipAddress =
    typeof clickInfo.ipAddress === "string"
      ? (clickInfo.ipAddress as string)
      : typeof data.ip === "string"
        ? (data.ip as string)
        : null;

  // Email security scanners "click"/"open" every link on delivery, which would
  // inflate open/click counts and engagement. Flag those events so they're
  // recorded for forensics but excluded from all aggregates below. Only
  // opens/clicks can come from a link scanner; delivered/bounced/complained are
  // server-to-server and always real.
  //
  // Resend stamps "Amazon CloudFront" on every click (it fronts the redirect),
  // so the UA can't catch gateway storms. Catch them by TIMING instead: if this
  // recipient already logged CLICK_BURST_MIN-1 clicks inside the burst window,
  // this click is part of a pre-fetch storm -- keep it out of counters and
  // engagement. (The authoritative human/scanner split is recomputed at display
  // time in click-analytics; this just stops real-time engagement inflation.)
  // Best-effort: a query failure falls back to UA-only detection.
  let clickBurst = false;
  if (eventType === "clicked" && sendRow?.id) {
    try {
      const since = new Date(Date.now() - CLICK_BURST_WINDOW_MS).toISOString();
      const { count } = await supabase
        .from("campaign_events")
        .select("id", { count: "exact", head: true })
        .eq("campaign_send_id", sendRow.id)
        .eq("event_type", "clicked")
        .gte("created_at", since);
      if ((count ?? 0) >= CLICK_BURST_MIN - 1) clickBurst = true;
    } catch {
      /* non-fatal */
    }
  }

  const fromBot =
    ((eventType === "opened" || eventType === "clicked") &&
      (isLikelyBotUserAgent(userAgent) || isLikelyDatacenterIp(ipAddress))) ||
    clickBurst;

  // Soft bounces are transient by definition (full mailbox, server down), so a
  // single one must never unsubscribe anyone. But a soft bounce that repeats
  // forever is a hard bounce wearing a hat: nothing else in the system removes
  // these addresses, so they get re-mailed on every campaign and each attempt
  // damages sender reputation. Escalate once an address has bounced
  // SOFT_BOUNCE_LIMIT times and has never once accepted a delivery -- "never
  // delivered" is what separates a dead address from a real subscriber whose
  // mailbox filled up for a week. Best-effort: a query failure falls back to
  // the old hard-bounce-only behaviour.
  let chronicSoftBounce = false;
  if (eventType === "bounced" && bounceIsSoft && sendRow?.audience_id) {
    try {
      const { count: everDelivered } = await supabase
        .from("campaign_sends")
        .select("id", { count: "exact", head: true })
        .eq("audience_id", sendRow.audience_id)
        .not("delivered_at", "is", null);
      if ((everDelivered ?? 0) === 0) {
        const { count: priorBounces } = await supabase
          .from("campaign_sends")
          .select("id", { count: "exact", head: true })
          .eq("audience_id", sendRow.audience_id)
          .not("bounced_at", "is", null);
        // +1 for the bounce being processed right now: campaign_sends.bounced_at
        // is not written until after this block.
        chronicSoftBounce = (priorBounces ?? 0) + 1 >= SOFT_BOUNCE_LIMIT;
      }
    } catch {
      /* non-fatal */
    }
  }

  // The single predicate for "this bounce should remove the recipient".
  const bounceRemoves = eventType === "bounced" && (!bounceIsSoft || chronicSoftBounce);

  // A click on the footer's unsubscribe / manage-preferences link is a real
  // human act, so it stays in the campaign's click metrics -- but it means the
  // recipient is leaving, not engaging, and must never reach the audience
  // aggregates that feed compute_engagement_score. Flagged on the event row so
  // the split stays auditable after the fact.
  const isListMgmtClick = eventType === "clicked" && isListManagementLink(url);

  await supabase.from("campaign_events").insert({
    campaign_id: sendRow?.campaign_id ?? null,
    campaign_send_id: sendRow?.id ?? null,
    subscriber_id: sendRow?.subscriber_id ?? null,
    resend_id: emailId,
    event_type: eventType,
    url,
    user_agent: userAgent,
    ip_address: ipAddress,
    metadata: {
      ...(event as unknown as Record<string, unknown>),
      is_bot: fromBot,
      is_list_mgmt: isListMgmtClick,
    },
  });

  // A scanner open/click is logged above but must not touch any counter,
  // timestamp, click-implies-open backfill, or audience engagement score.
  if (fromBot) {
    return Response.json({ ok: true, bot: true });
  }

  // Update the send row aggregates. We track first-event timestamps and
  // total counts; "unique" opens/clicks on the campaign are derived from
  // the send-row's opened_at / clicked_at being non-null (set once on
  // first event, never re-set).
  if (sendRow) {
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {};

    switch (eventType) {
      case "delivered": {
        // Only bump the aggregate on first delivered event for this send row
        // — Resend can re-emit deliveries on retry, and we don't want the
        // counter to drift above actual recipients.
        const { data: prior } = await supabase
          .from("campaign_sends")
          .select("delivered_at")
          .eq("id", sendRow.id)
          .single();
        const isFirstDelivery = !prior?.delivered_at;
        updates.delivered_at = now;
        updates.status = "delivered";
        if (isFirstDelivery && sendRow.campaign_id) {
          await bumpCampaign(sendRow.campaign_id, "delivered_count");
        }
        break;
      }
      case "opened": {
        // First open: record opened_at and bump campaign unique opens.
        const { data: prior } = await supabase
          .from("campaign_sends")
          .select("opened_at, open_count")
          .eq("id", sendRow.id)
          .single();
        const isFirstOpen = !prior?.opened_at;
        updates.last_opened_at = now;
        updates.open_count = (prior?.open_count ?? 0) + 1;
        if (isFirstOpen) {
          updates.opened_at = now;
          if (sendRow.campaign_id) await bumpCampaign(sendRow.campaign_id, "open_count");
        }
        break;
      }
      case "clicked": {
        const { data: prior } = await supabase
          .from("campaign_sends")
          .select("clicked_at, click_count, opened_at")
          .eq("id", sendRow.id)
          .single();
        const isFirstClick = !prior?.clicked_at;
        updates.last_clicked_at = now;
        updates.click_count = (prior?.click_count ?? 0) + 1;
        if (isFirstClick) {
          updates.clicked_at = now;
          if (sendRow.campaign_id) await bumpCampaign(sendRow.campaign_id, "click_count");
        }
        // A click implies the recipient opened the email even if the open
        // pixel never fired (image-blocked clients are common). Backfill.
        if (!prior?.opened_at) {
          updates.opened_at = now;
          updates.last_opened_at = now;
          if (sendRow.campaign_id) await bumpCampaign(sendRow.campaign_id, "open_count");
        }
        break;
      }
      case "bounced":
        updates.bounced_at = now;
        updates.status = "bounced";
        updates.bounce_type = bounceFlag;
        updates.bounce_reason =
          (typeof bounceInfo.message === "string" ? (bounceInfo.message as string) : null) ||
          (typeof bounceInfo.subType === "string" ? (bounceInfo.subType as string) : null) ||
          null;
        if (sendRow.campaign_id) await bumpCampaign(sendRow.campaign_id, "bounce_count");
        // Hard/undetermined bounces unsubscribe immediately; soft bounces only
        // once they've proven chronic (see bounceRemoves above). Protects
        // sender reputation without evicting someone over a transient blip.
        if (bounceRemoves && sendRow.subscriber_id) {
          await supabase
            .from("subscribers")
            .update({
              status: "unsubscribed",
              unsubscribed_at: now,
            })
            .eq("id", sendRow.subscriber_id);
        }
        break;
      case "complained":
        updates.complained_at = now;
        updates.status = "complained";
        if (sendRow.campaign_id) await bumpCampaign(sendRow.campaign_id, "complaint_count");
        // Spam complaints are a hard signal to remove.
        if (sendRow.subscriber_id) {
          await supabase
            .from("subscribers")
            .update({
              status: "unsubscribed",
              unsubscribed_at: now,
            })
            .eq("id", sendRow.subscriber_id);
        }
        break;
      default:
        // delivery_delayed, etc. — log only, no aggregate change.
        break;
    }

    if (Object.keys(updates).length > 0) {
      await supabase.from("campaign_sends").update(updates).eq("id", sendRow.id);
    }

    // Mirror to audience side — engagement aggregates + timeline event.
    if (sendRow.audience_id) {
      try {
        const { recordEmailEvent, setSubscriberStatus } = await import("@/lib/audience");
        const isFirstOpen = !!updates.opened_at;
        const isFirstClick = !!updates.clicked_at;
        // Open tracking is unreliable (Gmail/Apple Mail proxies) and the
        // UI no longer surfaces opens. Skip emitting audience-side open
        // events so the timeline + emails_opened counter don't accumulate
        // noise. Internal campaign_sends.opened_at still bumps so
        // click-implies-open backfill keeps working.
        // Unsubscribe / manage-preferences clicks are dropped here for the
        // same reason opens are: they'd bump last_clicked_at and score the
        // recipient `high` for opting out. campaign_sends + campaign_events
        // above still record the click, so nothing is lost for analytics.
        const audienceEventType =
          eventType === "delivered" ? "email_delivered"
            : eventType === "clicked" ? (isListMgmtClick ? null : "email_clicked")
            : eventType === "bounced" ? "email_bounced"
            : eventType === "complained" ? "email_complained"
            : null;
        if (audienceEventType) {
          await recordEmailEvent({
            audienceId: sendRow.audience_id,
            eventType: audienceEventType as
              | "email_delivered"
              | "email_opened"
              | "email_clicked"
              | "email_bounced"
              | "email_complained",
            isFirstOpen,
            isFirstClick,
            metadata: {
              campaign_id: sendRow.campaign_id,
              campaign_send_id: sendRow.id,
              url: url ?? undefined,
            },
          });
        }
        // Hard remove on complaint, on a hard/undetermined bounce, or on a
        // soft bounce that has proven chronic.
        if (eventType === "complained" || bounceRemoves) {
          await setSubscriberStatus(sendRow.audience_id, "unsubscribed");
        }
      } catch (e) {
        console.error("[resend webhook] audience mirror failed", e);
      }
    }
  }

  return Response.json({ ok: true });
}

async function bumpCampaign(
  campaignId: string,
  column:
    | "delivered_count"
    | "open_count"
    | "click_count"
    | "bounce_count"
    | "complaint_count"
) {
  const supabase = createAdminClient();
  // Atomic increment via RPC would be cleaner — for now read-then-write.
  // Concurrency risk is low (one campaign, batches of 100, single sender).
  const { data } = await supabase
    .from("campaigns")
    .select(column)
    .eq("id", campaignId)
    .single();
  const current = (data as Record<string, number> | null)?.[column] ?? 0;
  await supabase
    .from("campaigns")
    .update({ [column]: current + 1 })
    .eq("id", campaignId);
}
