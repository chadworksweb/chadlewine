import { createAdminClient } from "@/lib/supabase-server";
import { getResend, siteOrigin } from "@/lib/resend";
import { renderCampaignEmail } from "@/lib/email-template";
import { renderEmail as renderBlockEmail, type EmailBlock, type GlobalsRow } from "@/lib/email-blocks";
import { categoryColumn } from "@/lib/notification-categories";

/** Audience filter shape. Empty filter = all active subscribers.
   - tags_all: must have every listed tag (intersection)
   - tags_any: must have at least one listed tag (union)
   - exclude_tags: must have none of these
   - engagement_in: limit to these engagement_score values
*/
export interface AudienceFilter {
  tags_all?: string[];
  tags_any?: string[];
  exclude_tags?: string[];
  engagement_in?: string[];
  [key: string]: unknown;
}

export interface AudienceRow {
  id: string;            // audience.id
  email: string;
  unsubscribe_token: string | null;
  first_name: string | null;
}

/** Max audience size for a synchronous send. Above this, the send route
   returns 409 and the operator is expected to move to a background queue.

   Sized to what the in-route send can actually finish inside the 60s Vercel
   function budget (maxDuration on send/route.ts). At PACE_BATCH/PACE_MS plus
   per-email render+Resend overhead, throughput is ~2.3 emails/sec, so the
   function clears ~136 before it is killed. 120 leaves ~12s of headroom; going
   higher risks the silent half-send this is meant to prevent (where the
   function dies after dispatching some emails but before marking the campaign
   sent). Raise this only alongside a real background queue. */
export const SYNC_SEND_AUDIENCE_LIMIT = 120;

/** Resend's batch endpoint accepts up to 100 emails per call. */
export const RESEND_BATCH_SIZE = 100;

/** Resend rate-limits to 5 requests/second. We render+send one email per
   request, so pace at PACE_BATCH requests then wait PACE_MS -- staying safely
   under the limit (sending the whole batch in parallel triggers 429s). */
const PACE_BATCH = 4;
const PACE_MS = 1100;
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

/** Sender postal address rendered in the campaign-email footer (CAN-SPAM
   requires a valid physical address in every commercial email). Swap to
   a real street or PO Box once one is provisioned. */
const POSTAL_ADDRESS = "Chad Lewine, Coatesville, PA 19320";

/** Returns IDs of audience rows that have ALL of the given tags. */
async function audienceIdsWithAllTags(
  supabase: ReturnType<typeof createAdminClient>,
  tags: string[]
): Promise<Set<string>> {
  if (tags.length === 0) return new Set();
  // For each tag, fetch matching audience_ids, then intersect.
  const sets: Set<string>[] = [];
  for (const t of tags) {
    const { data } = await supabase
      .from("audience_tags")
      .select("audience_id")
      .eq("tag", t);
    sets.push(new Set((data || []).map((r) => r.audience_id as string)));
  }
  const [first, ...rest] = sets;
  let intersected = first;
  for (const s of rest) {
    intersected = new Set([...intersected].filter((id) => s.has(id)));
  }
  return intersected;
}

async function audienceIdsWithAnyTag(
  supabase: ReturnType<typeof createAdminClient>,
  tags: string[]
): Promise<Set<string>> {
  if (tags.length === 0) return new Set();
  const { data } = await supabase
    .from("audience_tags")
    .select("audience_id")
    .in("tag", tags);
  return new Set((data || []).map((r) => r.audience_id as string));
}

export async function fetchAudience(
  supabase: ReturnType<typeof createAdminClient>,
  filter: AudienceFilter,
  category?: string | null
): Promise<AudienceRow[]> {
  // Base set: active, non-unsubscribed audience rows.
  let query = supabase
    .from("audience")
    .select("id, email, unsubscribe_token, engagement_score, first_name")
    .eq("subscriber_status", "active")
    .is("unsubscribed_at", null);

  // Category gating: an optional category skips rows that opted out of it.
  // The required "general" category (and any unknown/empty value) maps to no
  // column, so it reaches every active subscriber.
  const catCol = category ? categoryColumn(category) : null;
  if (catCol) {
    query = query.eq(catCol, true);
  }

  if (filter.engagement_in && filter.engagement_in.length > 0) {
    query = query.in("engagement_score", filter.engagement_in);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Audience fetch failed: ${error.message}`);

  let rows = (data || []) as AudienceRow[];

  // Tag intersection / union / exclusion.
  if (filter.tags_all && filter.tags_all.length > 0) {
    const allow = await audienceIdsWithAllTags(supabase, filter.tags_all);
    rows = rows.filter((r) => allow.has(r.id));
  }
  if (filter.tags_any && filter.tags_any.length > 0) {
    const allow = await audienceIdsWithAnyTag(supabase, filter.tags_any);
    rows = rows.filter((r) => allow.has(r.id));
  }
  if (filter.exclude_tags && filter.exclude_tags.length > 0) {
    const block = await audienceIdsWithAnyTag(supabase, filter.exclude_tags);
    rows = rows.filter((r) => !block.has(r.id));
  }

  return rows;
}

export async function audienceCount(
  supabase: ReturnType<typeof createAdminClient>,
  filter: AudienceFilter,
  category?: string | null
): Promise<number> {
  const rows = await fetchAudience(supabase, filter, category);
  return rows.length;
}

interface CampaignRow {
  id: string;
  subject: string;
  preheader: string | null;
  body_html: string;
  body_blocks: EmailBlock[] | null;
  from_name: string;
  from_email: string;
  reply_to: string | null;
  audience_filter: AudienceFilter;
  category: string | null;
  status: string;
}

// Load the singleton globals row once per send batch.
async function loadGlobals(
  supabase: ReturnType<typeof createAdminClient>,
): Promise<GlobalsRow> {
  const { data } = await supabase
    .from("email_globals")
    .select("header_blocks, footer_blocks")
    .eq("id", 1)
    .maybeSingle();
  return {
    header_blocks: (data?.header_blocks as EmailBlock[]) || [],
    footer_blocks: (data?.footer_blocks as EmailBlock[]) || [],
  };
}

/** Build the unsubscribe URL for a given subscriber token. */
export function unsubscribeUrl(token: string): string {
  return `${siteOrigin()}/unsubscribe?token=${encodeURIComponent(token)}`;
}

/** Build the manage-preferences URL. Reuses the unsubscribe token -- the
   /preferences page resolves it to the audience row's category toggles. */
export function preferencesUrl(token: string): string {
  return `${siteOrigin()}/preferences?token=${encodeURIComponent(token)}`;
}

/** RFC 8058 one-click unsubscribe endpoint for the List-Unsubscribe header.
   Compliant mail clients (Gmail, Apple Mail) POST here, which unsubscribes
   immediately -- a deliberate user action. The visible in-body link uses
   unsubscribeUrl() (the confirm page) instead, so email security scanners that
   GET every link on delivery can't silently unsubscribe real recipients. */
export function unsubscribePostUrl(token: string): string {
  return `${siteOrigin()}/api/unsubscribe?token=${encodeURIComponent(token)}`;
}

/** Resend doesn't natively interpolate per-recipient links across a batch
   send, so we render each email individually and send through `emails.send`
   in parallel within a chunk. This is still well within free-tier rate
   limits at our scale (chunks of 100 in parallel, no chunking pressure). */
async function sendChunk(
  campaign: CampaignRow,
  globals: GlobalsRow,
  chunk: AudienceRow[]
): Promise<Array<{ row: AudienceRow; resendId?: string; error?: string }>> {
  const resend = getResend();
  const from = `${campaign.from_name} <${campaign.from_email}>`;
  const useBlocks = Array.isArray(campaign.body_blocks) && campaign.body_blocks.length > 0;

  return Promise.all(
    chunk.map(async (row) => {
      try {
        const unsub = unsubscribeUrl(row.unsubscribe_token || "");
        const unsubPost = unsubscribePostUrl(row.unsubscribe_token || "");
        const prefs = preferencesUrl(row.unsubscribe_token || "");
        const { html, text } = useBlocks
          ? renderBlockEmail(
              {
                slug: `campaign-${campaign.id}`,
                name: campaign.subject,
                kind: "campaign",
                subject_template: campaign.subject,
                preheader_template: campaign.preheader,
                body_blocks: campaign.body_blocks as EmailBlock[],
              },
              globals,
              {
                first_name: row.first_name ?? null,
                unsubscribe_url: unsub,
                preferences_url: prefs,
                postal_address: POSTAL_ADDRESS,
              },
            )
          : renderCampaignEmail({
              subject: campaign.subject,
              preheader: campaign.preheader,
              bodyHtml: campaign.body_html,
              unsubscribeUrl: unsub,
              preferencesUrl: prefs,
              fromName: campaign.from_name,
              postalAddress: POSTAL_ADDRESS,
            });

        const { data, error } = await resend.emails.send({
          from,
          to: row.email,
          subject: campaign.subject,
          html,
          text,
          replyTo: campaign.reply_to || undefined,
          headers: {
            "List-Unsubscribe": `<${unsubPost}>, <mailto:unsubscribe@chadlewine.com>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        });

        if (error) return { row, error: error.message };
        return { row, resendId: data?.id };
      } catch (e) {
        return { row, error: e instanceof Error ? e.message : String(e) };
      }
    })
  );
}

/** Sends to `rows` paced under Resend's 5/sec limit (PACE_BATCH per ~PACE_MS),
   invoking `onResult` for each recipient so the caller can persist status. */
async function sendPaced(
  campaign: CampaignRow,
  globals: GlobalsRow,
  rows: AudienceRow[],
  onResult: (r: {
    row: AudienceRow;
    resendId?: string;
    error?: string;
  }) => Promise<void>,
): Promise<SendResult> {
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < rows.length; i += PACE_BATCH) {
    const batch = rows.slice(i, i + PACE_BATCH);
    const results = await sendChunk(campaign, globals, batch);
    for (const r of results) {
      if (r.error) failed++;
      else sent++;
      await onResult(r);
    }
    if (i + PACE_BATCH < rows.length) await sleep(PACE_MS);
  }
  return { sent, failed };
}

export interface SendResult {
  sent: number;
  failed: number;
}

export async function sendCampaign(campaignId: string): Promise<SendResult> {
  const supabase = createAdminClient();

  // 1. Lock the campaign by flipping to 'sending'. Only proceed if the
  //    current row was actually a draft — prevents double-sends.
  const { data: locked, error: lockErr } = await supabase
    .from("campaigns")
    .update({ status: "sending", updated_at: new Date().toISOString() })
    .eq("id", campaignId)
    .eq("status", "draft")
    .select(
      "id, subject, preheader, body_html, body_blocks, from_name, from_email, reply_to, audience_filter, category, status"
    )
    .single();

  if (lockErr || !locked) {
    throw new Error(
      "Campaign is not in draft status, or another send is in progress."
    );
  }
  const campaign = locked as CampaignRow;

  // 2. Pull the audience + load shared header/footer globals once.
  const audience = await fetchAudience(supabase, campaign.audience_filter, campaign.category);
  const globals = await loadGlobals(supabase);
  if (audience.length === 0) {
    await supabase
      .from("campaigns")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", campaignId);
    throw new Error("No active subscribers in audience.");
  }
  if (audience.length > SYNC_SEND_AUDIENCE_LIMIT) {
    await supabase
      .from("campaigns")
      .update({ status: "draft", updated_at: new Date().toISOString() })
      .eq("id", campaignId);
    throw new Error(
      `Audience size ${audience.length} exceeds the synchronous send limit (${SYNC_SEND_AUDIENCE_LIMIT}). A background queue is required — see plans/abundant-whistling-wand.md.`
    );
  }

  // 3. Pre-insert one queued row per recipient. We'll update each row after
  //    its Resend call completes, so partial failures leave a clean log.
  const queuedRows = audience.map((row) => ({
    campaign_id: campaignId,
    audience_id: row.id,
    email: row.email,
    status: "queued",
    is_test: false,
  }));
  await supabase.from("campaign_sends").insert(queuedRows);

  // 4. Send, paced under Resend's 5/sec limit.
  const { sent, failed } = await sendPaced(campaign, globals, audience, async (r) => {
    if (r.error) {
      await supabase
        .from("campaign_sends")
        .update({ status: "failed", error: r.error })
        .eq("campaign_id", campaignId)
        .eq("audience_id", r.row.id);
    } else {
      await supabase
        .from("campaign_sends")
        .update({
          status: "sent",
          resend_id: r.resendId,
          sent_at: new Date().toISOString(),
        })
        .eq("campaign_id", campaignId)
        .eq("audience_id", r.row.id);
    }
  });

  // 5. Finalize.
  await supabase
    .from("campaigns")
    .update({
      status: sent > 0 ? "sent" : "failed",
      sent_at: new Date().toISOString(),
      sent_count: sent,
      failed_count: failed,
      updated_at: new Date().toISOString(),
    })
    .eq("id", campaignId);

  return { sent, failed };
}

/** Re-sends a campaign to only the recipients whose previous send failed
   (e.g. after a rate-limit wave). Never re-sends to anyone already sent.
   Paced under Resend's limit; recomputes the campaign's counts afterward. */
export async function resendCampaignFailures(
  campaignId: string,
): Promise<SendResult> {
  const supabase = createAdminClient();

  const { data: campaign, error: cErr } = await supabase
    .from("campaigns")
    .select(
      "id, subject, preheader, body_html, body_blocks, from_name, from_email, reply_to, audience_filter, category, status",
    )
    .eq("id", campaignId)
    .single();
  if (cErr || !campaign) throw new Error("Campaign not found.");

  // Recipients whose real (non-test) send failed.
  const { data: failedSends } = await supabase
    .from("campaign_sends")
    .select("audience_id")
    .eq("campaign_id", campaignId)
    .eq("is_test", false)
    .eq("status", "failed");
  const failedIds = new Set(
    (failedSends || []).map((s) => s.audience_id as string),
  );
  if (failedIds.size === 0) return { sent: 0, failed: 0 };

  const globals = await loadGlobals(supabase);
  // Reuse the audience filter to recover first_name + unsubscribe_token, then
  // narrow to the failed recipients (skips anyone since unsubscribed or newly
  // opted out of this campaign's category).
  const audience = await fetchAudience(
    supabase,
    (campaign as CampaignRow).audience_filter,
    (campaign as CampaignRow).category,
  );
  const targets = audience.filter((a) => failedIds.has(a.id));
  if (targets.length === 0) return { sent: 0, failed: 0 };

  const result = await sendPaced(
    campaign as CampaignRow,
    globals,
    targets,
    async (r) => {
      if (r.error) {
        await supabase
          .from("campaign_sends")
          .update({ status: "failed", error: r.error })
          .eq("campaign_id", campaignId)
          .eq("audience_id", r.row.id);
      } else {
        await supabase
          .from("campaign_sends")
          .update({
            status: "sent",
            resend_id: r.resendId,
            sent_at: new Date().toISOString(),
            error: null,
          })
          .eq("campaign_id", campaignId)
          .eq("audience_id", r.row.id);
      }
    },
  );

  // Recompute counts from the source of truth (campaign_sends).
  const { data: rows } = await supabase
    .from("campaign_sends")
    .select("status")
    .eq("campaign_id", campaignId)
    .eq("is_test", false);
  const failedNow = (rows || []).filter((r) => r.status === "failed").length;
  const sentNow = (rows || []).length - failedNow;
  await supabase
    .from("campaigns")
    .update({
      sent_count: sentNow,
      failed_count: failedNow,
      status: sentNow > 0 ? "sent" : "failed",
      updated_at: new Date().toISOString(),
    })
    .eq("id", campaignId);

  return result;
}

/** Sends a single test email to an arbitrary address. Logs to
   campaign_sends with is_test=true so the real audience stats stay clean. */
export async function sendTest(
  campaignId: string,
  toEmail: string
): Promise<{ id?: string; error?: string }> {
  const supabase = createAdminClient();

  const { data: campaign, error } = await supabase
    .from("campaigns")
    .select(
      "id, subject, preheader, body_html, body_blocks, from_name, from_email, reply_to"
    )
    .eq("id", campaignId)
    .single();

  if (error || !campaign) throw new Error("Campaign not found.");

  const resend = getResend();
  const from = `${campaign.from_name} <${campaign.from_email}>`;
  const unsub = `${siteOrigin()}/unsubscribe?token=preview-test`;
  const prefs = `${siteOrigin()}/preferences?token=preview-test`;

  const useBlocks =
    Array.isArray(campaign.body_blocks) && (campaign.body_blocks as EmailBlock[]).length > 0;
  const globals = useBlocks ? await loadGlobals(supabase) : null;

  const { html, text } = useBlocks && globals
    ? renderBlockEmail(
        {
          slug: `campaign-${campaign.id}-test`,
          name: `[TEST] ${campaign.subject}`,
          kind: "campaign",
          subject_template: `[TEST] ${campaign.subject}`,
          preheader_template: campaign.preheader,
          body_blocks: campaign.body_blocks as EmailBlock[],
        },
        globals,
        {
          first_name: null,
          unsubscribe_url: unsub,
          preferences_url: prefs,
          postal_address: POSTAL_ADDRESS,
        },
      )
    : renderCampaignEmail({
        subject: `[TEST] ${campaign.subject}`,
        preheader: campaign.preheader,
        bodyHtml: campaign.body_html,
        unsubscribeUrl: unsub,
        preferencesUrl: prefs,
        fromName: campaign.from_name,
        postalAddress: POSTAL_ADDRESS,
      });

  const { data, error: sendErr } = await resend.emails.send({
    from,
    to: toEmail,
    subject: `[TEST] ${campaign.subject}`,
    html,
    text,
    replyTo: campaign.reply_to || undefined,
  });

  await supabase.from("campaign_sends").insert({
    campaign_id: campaignId,
    subscriber_id: null,
    email: toEmail,
    is_test: true,
    status: sendErr ? "failed" : "sent",
    resend_id: data?.id,
    error: sendErr?.message,
    sent_at: sendErr ? null : new Date().toISOString(),
  });

  if (sendErr) return { error: sendErr.message };
  return { id: data?.id };
}
