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

/** Hard ceiling on a single campaign's audience. Sends of any size below this
   drain reliably through the background queue (enqueueCampaign + the
   /api/cron/campaign-queue worker), so this is just a sanity guard against a
   filter mistake that would fan out to an absurd number of rows. */
export const MAX_CAMPAIGN_AUDIENCE = 50000;

/** Queued recipients are inserted in chunks to keep each insert payload sane
   on very large audiences. */
const INSERT_CHUNK = 500;

/** Background-drain tuning. Each cron tick claims CLAIM_BATCH queued rows,
   sends them paced, then stops if it's within RESERVE_MS of its deadline so a
   started batch always finishes inside the function's maxDuration. A row left
   in 'sending_row' (claimed but never resolved -- a crashed tick) is reclaimed
   to 'queued' once its claim is older than STALE_CLAIM_MS. */
const CLAIM_BATCH = 100;
const RESERVE_MS = 30000;
const STALE_CLAIM_MS = 2 * 60 * 1000;

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
          replyTo: campaign.reply_to || process.env.EMAIL_REPLY_TO || undefined,
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

export interface EnqueueResult {
  queued: number;
}

/** Enqueue-only "Send". Locks the campaign draft->sending and inserts one
   queued campaign_sends row per recipient, then returns immediately -- the
   actual delivery happens in the background via drainCampaignQueue (the
   /api/cron/campaign-queue worker). This keeps "Send" fast and lets lists of
   any size go out reliably instead of dying inside a single 60s function. */
export async function enqueueCampaign(campaignId: string): Promise<EnqueueResult> {
  const supabase = createAdminClient();

  // 1. Lock the campaign by flipping to 'sending'. Only proceed if the
  //    current row was actually a draft -- prevents double-enqueues.
  const { data: locked, error: lockErr } = await supabase
    .from("campaigns")
    .update({ status: "sending", updated_at: new Date().toISOString() })
    .eq("id", campaignId)
    .eq("status", "draft")
    .select("id, audience_filter, category")
    .single();

  if (lockErr || !locked) {
    throw new Error(
      "Campaign is not in draft status, or another send is in progress."
    );
  }
  const lockedRow = locked as {
    audience_filter: AudienceFilter;
    category: string | null;
  };

  // 2. Resolve the audience now (filters are evaluated at send time).
  const audience = await fetchAudience(
    supabase,
    lockedRow.audience_filter,
    lockedRow.category
  );
  if (audience.length === 0) {
    await supabase
      .from("campaigns")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", campaignId);
    throw new Error("No active subscribers in audience.");
  }
  if (audience.length > MAX_CAMPAIGN_AUDIENCE) {
    // Unlock back to draft so the operator can narrow the filter.
    await supabase
      .from("campaigns")
      .update({ status: "draft", updated_at: new Date().toISOString() })
      .eq("id", campaignId);
    throw new Error(
      `Audience size ${audience.length} exceeds the maximum (${MAX_CAMPAIGN_AUDIENCE}). Narrow the filter.`
    );
  }

  // 3. Insert one queued row per recipient (chunked). The worker claims and
  //    sends these on its next tick.
  const queuedRows = audience.map((row) => ({
    campaign_id: campaignId,
    audience_id: row.id,
    email: row.email,
    status: "queued",
    is_test: false,
  }));
  for (let i = 0; i < queuedRows.length; i += INSERT_CHUNK) {
    const { error } = await supabase
      .from("campaign_sends")
      .insert(queuedRows.slice(i, i + INSERT_CHUNK));
    if (error) {
      throw new Error(`Failed to enqueue recipients: ${error.message}`);
    }
  }

  return { queued: queuedRows.length };
}

const CAMPAIGN_SELECT =
  "id, subject, preheader, body_html, body_blocks, from_name, from_email, reply_to, audience_filter, category, status";

interface ClaimedRow {
  id: string;
  audience_id: string | null;
  email: string;
}

/** Atomically claim up to `limit` queued rows for a campaign. The two-step
   select-then-guarded-update is race-safe under Postgres READ COMMITTED: a
   concurrent tick's UPDATE re-checks `status = 'queued'` after acquiring the
   row lock, so each claimed row is returned to exactly one caller. We stamp
   sent_at with the claim time so a crashed tick's 'sending_row' rows can be
   detected as stale and reclaimed (sent_at is meaningless until a row is
   actually sent, when it's overwritten with the real send time). */
async function claimQueuedRows(
  supabase: ReturnType<typeof createAdminClient>,
  campaignId: string,
  limit: number
): Promise<ClaimedRow[]> {
  const { data: candidates } = await supabase
    .from("campaign_sends")
    .select("id")
    .eq("campaign_id", campaignId)
    .eq("status", "queued")
    .eq("is_test", false)
    .limit(limit);
  const ids = (candidates || []).map((c) => c.id as string);
  if (ids.length === 0) return [];

  const { data: claimed } = await supabase
    .from("campaign_sends")
    .update({ status: "sending_row", sent_at: new Date().toISOString() })
    .in("id", ids)
    .eq("status", "queued")
    .select("id, audience_id, email");
  return (claimed || []) as ClaimedRow[];
}

/** Resolve first_name + unsubscribe_token for claimed rows (campaign_sends
   only stores the email), shaping them into the AudienceRow the renderer
   expects. Returns a map from the row key back to the campaign_sends id so
   results can be written to the exact claimed row. */
async function hydrateClaimedRows(
  supabase: ReturnType<typeof createAdminClient>,
  claimed: ClaimedRow[]
): Promise<{ rows: AudienceRow[]; sendIdByKey: Map<string, string> }> {
  const audIds = claimed
    .map((c) => c.audience_id)
    .filter((v): v is string => !!v);
  const audById = new Map<string, { unsubscribe_token: string | null; first_name: string | null }>();
  if (audIds.length > 0) {
    const { data: auds } = await supabase
      .from("audience")
      .select("id, unsubscribe_token, first_name")
      .in("id", audIds);
    for (const a of auds || []) {
      audById.set(a.id as string, {
        unsubscribe_token: (a.unsubscribe_token as string) ?? null,
        first_name: (a.first_name as string) ?? null,
      });
    }
  }
  const rows: AudienceRow[] = [];
  const sendIdByKey = new Map<string, string>();
  for (const c of claimed) {
    const key = c.audience_id ?? c.id;
    const a = c.audience_id ? audById.get(c.audience_id) : null;
    rows.push({
      id: key,
      email: c.email,
      unsubscribe_token: a?.unsubscribe_token ?? null,
      first_name: a?.first_name ?? null,
    });
    sendIdByKey.set(key, c.id);
  }
  return { rows, sendIdByKey };
}

/** Recompute counts from campaign_sends (the source of truth) and flip the
   campaign to its terminal status. Mirrors resendCampaignFailures' recount. */
async function finalizeCampaign(
  supabase: ReturnType<typeof createAdminClient>,
  campaignId: string
): Promise<void> {
  const { data: rows } = await supabase
    .from("campaign_sends")
    .select("status")
    .eq("campaign_id", campaignId)
    .eq("is_test", false);
  const all = rows || [];
  const failedNow = all.filter((r) => r.status === "failed").length;
  const sentNow = all.length - failedNow;
  await supabase
    .from("campaigns")
    .update({
      status: sentNow > 0 ? "sent" : "failed",
      sent_at: new Date().toISOString(),
      sent_count: sentNow,
      failed_count: failedNow,
      updated_at: new Date().toISOString(),
    })
    .eq("id", campaignId);
}

interface DrainCampaignResult {
  processed: number;
  sent: number;
  failed: number;
  finalized: boolean;
}

async function drainOneCampaign(
  supabase: ReturnType<typeof createAdminClient>,
  campaignId: string,
  deadline: number
): Promise<DrainCampaignResult> {
  // Reclaim rows a crashed prior tick left mid-flight, so they re-send.
  const staleCutoff = new Date(Date.now() - STALE_CLAIM_MS).toISOString();
  await supabase
    .from("campaign_sends")
    .update({ status: "queued", sent_at: null })
    .eq("campaign_id", campaignId)
    .eq("status", "sending_row")
    .lt("sent_at", staleCutoff);

  const { data: campaign } = await supabase
    .from("campaigns")
    .select(CAMPAIGN_SELECT)
    .eq("id", campaignId)
    .single();

  let processed = 0;
  let sent = 0;
  let failed = 0;

  if (campaign) {
    const globals = await loadGlobals(supabase);
    // Keep claiming + sending batches until we run low on time or the queue
    // for this campaign is empty. RESERVE_MS guarantees a claimed batch always
    // finishes inside the function's maxDuration.
    while (Date.now() < deadline - RESERVE_MS) {
      const claimed = await claimQueuedRows(supabase, campaignId, CLAIM_BATCH);
      if (claimed.length === 0) break;
      const { rows, sendIdByKey } = await hydrateClaimedRows(supabase, claimed);
      const result = await sendPaced(
        campaign as CampaignRow,
        globals,
        rows,
        async (r) => {
          const sendId = sendIdByKey.get(r.row.id);
          if (!sendId) return;
          if (r.error) {
            await supabase
              .from("campaign_sends")
              .update({ status: "failed", error: r.error, sent_at: null })
              .eq("id", sendId);
          } else {
            await supabase
              .from("campaign_sends")
              .update({
                status: "sent",
                resend_id: r.resendId,
                sent_at: new Date().toISOString(),
                error: null,
              })
              .eq("id", sendId);
          }
        }
      );
      sent += result.sent;
      failed += result.failed;
      processed += claimed.length;
    }
  }

  // Finalize only once nothing is queued or mid-flight for this campaign.
  const { count } = await supabase
    .from("campaign_sends")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .in("status", ["queued", "sending_row"]);
  let finalized = false;
  if ((count ?? 0) === 0) {
    await finalizeCampaign(supabase, campaignId);
    finalized = true;
  }

  return { processed, sent, failed, finalized };
}

export interface DrainSummary {
  campaigns: Array<{ campaign_id: string } & DrainCampaignResult>;
}

/** Background worker: drains queued recipients for every campaign currently
   in 'sending', pacing under Resend's 5/sec limit and stopping before the
   given `deadline` (epoch ms). Campaigns are processed sequentially so global
   throughput across the tick stays under the rate limit. Idempotent: row-level
   claims prevent double-sends and stale claims self-heal on the next tick. */
export async function drainCampaignQueue(deadline: number): Promise<DrainSummary> {
  const supabase = createAdminClient();
  const { data: sending } = await supabase
    .from("campaigns")
    .select("id")
    .eq("status", "sending")
    .order("updated_at", { ascending: true });

  const out: DrainSummary["campaigns"] = [];
  for (const c of sending || []) {
    if (Date.now() >= deadline - RESERVE_MS) break;
    const r = await drainOneCampaign(supabase, c.id as string, deadline);
    out.push({ campaign_id: c.id as string, ...r });
  }
  return { campaigns: out };
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
    replyTo: campaign.reply_to || process.env.EMAIL_REPLY_TO || undefined,
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
