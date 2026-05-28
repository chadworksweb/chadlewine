import { Webhook } from "svix";
import { createAdminClient } from "@/lib/supabase-server";

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

  await supabase.from("campaign_events").insert({
    campaign_id: sendRow?.campaign_id ?? null,
    campaign_send_id: sendRow?.id ?? null,
    subscriber_id: sendRow?.subscriber_id ?? null,
    resend_id: emailId,
    event_type: eventType,
    url,
    user_agent: userAgent,
    ip_address: ipAddress,
    metadata: event as unknown as Record<string, unknown>,
  });

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
        // Only hard/undetermined bounces unsubscribe (protect sender
        // reputation). Soft (transient) bounces are temporary -- keep them.
        if (!bounceIsSoft && sendRow.subscriber_id) {
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
        const audienceEventType =
          eventType === "delivered" ? "email_delivered"
            : eventType === "clicked" ? "email_clicked"
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
        // Hard remove on complaint, or on a hard/undetermined bounce -- never
        // on a soft (transient) bounce.
        if (eventType === "complained" || (eventType === "bounced" && !bounceIsSoft)) {
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
