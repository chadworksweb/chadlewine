import { createAdminClient } from "@/lib/supabase-server";
import {
  notifyNewMember,
  notifyTierChange,
  deriveTier,
  type MemberTier,
} from "@/lib/audience-notify";
import {
  OPTIONAL_CATEGORIES,
  categoryColumn,
} from "@/lib/notification-categories";

/* Audience helper library — single source of truth for upserting and
   tagging the master contact record. Every state-changing helper emits
   a row into `audience_events` via the `upsert_audience_event` RPC so
   the timeline is canonical.

   Callers should rarely write to the `audience` / `audience_tags` /
   `audience_events` tables directly — these helpers keep the rollups
   (lifetime_*, emails_*, engagement_score, system tags) in sync. */

type SupabaseAdminClient = ReturnType<typeof createAdminClient>;

export interface MailingAddress {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function emitEvent(
  supabase: SupabaseAdminClient,
  audienceId: string,
  eventType: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  await supabase.rpc("upsert_audience_event", {
    p_audience_id: audienceId,
    p_event_type: eventType,
    p_metadata: metadata ? metadata : null,
  });
}

async function refreshTags(
  supabase: SupabaseAdminClient,
  audienceId: string
): Promise<void> {
  await supabase.rpc("refresh_audience_tags", { p_audience_id: audienceId });
}

/* Find an audience row by lowercased email. Returns null if not found. */
export async function findAudienceByEmail(
  email: string
): Promise<{ id: string; subscriber_status: string; unsubscribe_token: string | null } | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("audience")
    .select("id, subscriber_status, unsubscribe_token")
    .eq("email", normalizeEmail(email))
    .maybeSingle();
  return data ?? null;
}

/* Find by audience.user_id (used by /account/* server routes). */
export async function findAudienceByUserId(
  userId: string
): Promise<{ id: string; email: string } | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("audience")
    .select("id, email")
    .eq("user_id", userId)
    .maybeSingle();
  return data ?? null;
}

/* Public subscribe form → upsert audience. Idempotent. */
export async function upsertAudienceFromSubscribe(opts: {
  email: string;
  source_page?: string | null;
}): Promise<string> {
  const supabase = createAdminClient();
  const email = normalizeEmail(opts.email);

  const { data: existing } = await supabase
    .from("audience")
    .select("id, subscriber_status, user_id, lifetime_orders")
    .eq("email", email)
    .maybeSingle();

  let audienceId: string;
  const now = new Date().toISOString();
  const isNew = !existing;

  if (existing) {
    audienceId = existing.id;
    if (existing.subscriber_status !== "unsubscribed") {
      // Don't auto-resubscribe a row that explicitly opted out — they
      // can come back via /account/preferences or the resubscribe link.
      await supabase
        .from("audience")
        .update({
          subscriber_status: "active",
          marketing_opt_in_at: now,
          marketing_opt_in_source: "subscribe",
          updated_at: now,
        })
        .eq("id", audienceId);
    }
  } else {
    const { data: inserted, error } = await supabase
      .from("audience")
      .insert({
        email,
        subscriber_status: "active",
        marketing_opt_in_at: now,
        marketing_opt_in_source: "subscribe",
      })
      .select("id")
      .single();
    if (error || !inserted) {
      throw new Error(`audience upsert failed: ${error?.message}`);
    }
    audienceId = inserted.id;
  }

  await emitEvent(supabase, audienceId, "subscribed", {
    source_page: opts.source_page ?? null,
  });
  await refreshTags(supabase, audienceId);

  // Notify admin — new member only (existing subscribers don't re-trigger).
  if (isNew) {
    void notifyNewMember({
      audience_id: audienceId,
      email,
      tier: "subscriber",
      source: opts.source_page ? `subscribe — ${opts.source_page}` : "subscribe",
    });
  }
  return audienceId;
}

/* Stripe webhook → upsert audience on purchase. */
export async function upsertAudienceFromPurchase(opts: {
  email: string;
  display_name?: string | null;
  shipping?: MailingAddress | null;
  marketing_opt_in: boolean;
  order_id: string;
  order_number?: string | null;
  total: number;
}): Promise<string> {
  const supabase = createAdminClient();
  const email = normalizeEmail(opts.email);
  const now = new Date().toISOString();

  const { data: existing } = await supabase
    .from("audience")
    .select(
      "id, subscriber_status, display_name, mailing_line1, lifetime_orders, lifetime_spend, first_purchase_at, user_id"
    )
    .eq("email", email)
    .maybeSingle();

  const prevTier: MemberTier | null = existing
    ? deriveTier({
        subscriber_status: existing.subscriber_status,
        user_id: existing.user_id,
        lifetime_orders: existing.lifetime_orders,
      })
    : null;

  // Build the update/insert payload. Never overwrite a user-provided
  // mailing address or display name — only fill if currently blank.
  const updateFromOrder: Record<string, unknown> = { updated_at: now };
  if (opts.display_name && (!existing || !existing.display_name)) {
    updateFromOrder.display_name = opts.display_name;
    // Split full name into first/last (first space). Only fill if blank
    // so a user who already typed their preferred name in /account stays
    // authoritative.
    const trimmed = opts.display_name.trim();
    const spaceAt = trimmed.indexOf(" ");
    const first = spaceAt === -1 ? trimmed : trimmed.slice(0, spaceAt);
    const last = spaceAt === -1 ? null : trimmed.slice(spaceAt + 1).trim() || null;
    updateFromOrder.first_name = first;
    if (last) updateFromOrder.last_name = last;
  }
  if (opts.shipping && (!existing || !existing.mailing_line1)) {
    updateFromOrder.mailing_line1 = opts.shipping.line1 ?? null;
    updateFromOrder.mailing_line2 = opts.shipping.line2 ?? null;
    updateFromOrder.mailing_city = opts.shipping.city ?? null;
    updateFromOrder.mailing_state = opts.shipping.state ?? null;
    updateFromOrder.mailing_postal_code = opts.shipping.postal_code ?? null;
    updateFromOrder.mailing_country = opts.shipping.country ?? null;
  }

  // Honor the opt-in flag — but never re-subscribe a row that explicitly
  // opted out. Only flip 'never' → 'active'.
  if (opts.marketing_opt_in && (!existing || existing.subscriber_status === "never")) {
    updateFromOrder.subscriber_status = "active";
    updateFromOrder.marketing_opt_in_at = now;
    updateFromOrder.marketing_opt_in_source = "purchase";
  }

  let audienceId: string;
  if (existing) {
    audienceId = existing.id;
    if (Object.keys(updateFromOrder).length > 1) {
      // > 1 because updated_at is always set; we only persist if there's
      // something else to write.
      await supabase.from("audience").update(updateFromOrder).eq("id", audienceId);
    }
  } else {
    const { data: inserted, error } = await supabase
      .from("audience")
      .insert({
        email,
        ...updateFromOrder,
        first_seen_at: now,
      })
      .select("id")
      .single();
    if (error || !inserted) {
      throw new Error(`audience upsert failed: ${error?.message}`);
    }
    audienceId = inserted.id;
  }

  // Bump lifetime rollups + first/last purchase timestamps.
  const lifetimeOrders = (existing?.lifetime_orders ?? 0) + 1;
  const lifetimeSpend = Number(existing?.lifetime_spend ?? 0) + Number(opts.total);
  await supabase
    .from("audience")
    .update({
      lifetime_orders: lifetimeOrders,
      lifetime_spend: lifetimeSpend,
      last_purchase_at: now,
      first_purchase_at: existing?.first_purchase_at ?? now,
      updated_at: now,
    })
    .eq("id", audienceId);

  await emitEvent(supabase, audienceId, "purchased", {
    order_id: opts.order_id,
    order_number: opts.order_number,
    total: opts.total,
  });
  if (updateFromOrder.subscriber_status === "active") {
    await emitEvent(supabase, audienceId, "subscribed", {
      source: "purchase",
      order_id: opts.order_id,
    });
  }
  await refreshTags(supabase, audienceId);

  // Fan-track grants are NOT minted here. The 24h drip cron
  // (src/app/api/cron/fan-track-drip/route.ts) is the sole automatic
  // grant + invite path so panel + email reveal together at the 24h
  // mark. Admin-added grants and the publish-time backfill remain
  // available as off-path tools.

  // Admin notifications — new member if this is the first time we've seen
  // them, otherwise a tier-change notification (e.g. subscriber → customer
  // on first purchase, customer → repeat-customer on second).
  const newTier = deriveTier({
    subscriber_status: (updateFromOrder.subscriber_status as string | undefined) ||
      existing?.subscriber_status || "active",
    user_id: existing?.user_id ?? null,
    lifetime_orders: lifetimeOrders,
  });
  const memberCtx = {
    audience_id: audienceId,
    email,
    display_name: opts.display_name ?? null,
    tier: newTier,
    source: opts.order_number ? `purchase — ${opts.order_number}` : "purchase",
    lifetime_orders: lifetimeOrders,
    lifetime_spend: lifetimeSpend,
  };
  if (!existing) {
    void notifyNewMember(memberCtx);
  } else if (prevTier && prevTier !== newTier) {
    void notifyTierChange(memberCtx, prevTier);
  }
  return audienceId;
}

/* Unsubscribe by token (token resolves against audience.unsubscribe_token).
   Returns true if a row was flipped from active → unsubscribed. */
export async function markUnsubscribedByToken(token: string): Promise<boolean> {
  const supabase = createAdminClient();
  const { data: existing } = await supabase
    .from("audience")
    .select("id, email, display_name, subscriber_status, user_id, lifetime_orders, lifetime_spend")
    .eq("unsubscribe_token", token)
    .maybeSingle();
  if (!existing) return false;
  const prevTier = deriveTier({
    subscriber_status: existing.subscriber_status,
    user_id: existing.user_id,
    lifetime_orders: existing.lifetime_orders,
  });
  const now = new Date().toISOString();
  await supabase
    .from("audience")
    .update({
      subscriber_status: "unsubscribed",
      unsubscribed_at: now,
      updated_at: now,
    })
    .eq("id", existing.id);
  // Mirror to legacy subscribers row(s).
  await supabase
    .from("subscribers")
    .update({ status: "unsubscribed", unsubscribed_at: now })
    .eq("audience_id", existing.id);
  await emitEvent(supabase, existing.id, "unsubscribed", { via: "token" });
  await refreshTags(supabase, existing.id);

  void notifyTierChange(
    {
      audience_id: existing.id,
      email: existing.email,
      display_name: existing.display_name,
      tier: "unsubscribed",
      source: "token unsubscribe link",
      lifetime_orders: existing.lifetime_orders,
      lifetime_spend: existing.lifetime_spend,
    },
    prevTier
  );
  return true;
}

/* Resubscribe by token. */
export async function markResubscribedByToken(token: string): Promise<boolean> {
  const supabase = createAdminClient();
  const { data: existing } = await supabase
    .from("audience")
    .select("id, email, display_name, user_id, lifetime_orders, lifetime_spend")
    .eq("unsubscribe_token", token)
    .maybeSingle();
  if (!existing) return false;
  const now = new Date().toISOString();
  await supabase
    .from("audience")
    .update({
      subscriber_status: "active",
      unsubscribed_at: null,
      marketing_opt_in_at: now,
      updated_at: now,
    })
    .eq("id", existing.id);
  await supabase
    .from("subscribers")
    .update({ status: "active", unsubscribed_at: null })
    .eq("audience_id", existing.id);
  await emitEvent(supabase, existing.id, "resubscribed", { via: "token" });
  await refreshTags(supabase, existing.id);

  const newTier = deriveTier({
    subscriber_status: "active",
    user_id: existing.user_id,
    lifetime_orders: existing.lifetime_orders,
  });
  void notifyTierChange(
    {
      audience_id: existing.id,
      email: existing.email,
      display_name: existing.display_name,
      tier: newTier,
      source: "resubscribe link",
      lifetime_orders: existing.lifetime_orders,
      lifetime_spend: existing.lifetime_spend,
    },
    "unsubscribed"
  );
  return true;
}

/* Admin flips status by audience id (used from /admin/audience). */
export async function setSubscriberStatus(
  audienceId: string,
  status: "active" | "unsubscribed"
): Promise<void> {
  const supabase = createAdminClient();
  const { data: existing } = await supabase
    .from("audience")
    .select("email, display_name, subscriber_status, user_id, lifetime_orders, lifetime_spend")
    .eq("id", audienceId)
    .maybeSingle();
  const prevTier = existing
    ? deriveTier({
        subscriber_status: existing.subscriber_status,
        user_id: existing.user_id,
        lifetime_orders: existing.lifetime_orders,
      })
    : null;

  const now = new Date().toISOString();
  await supabase
    .from("audience")
    .update({
      subscriber_status: status,
      unsubscribed_at: status === "unsubscribed" ? now : null,
      marketing_opt_in_at: status === "active" ? now : undefined,
      updated_at: now,
    })
    .eq("id", audienceId);
  await supabase
    .from("subscribers")
    .update({
      status,
      unsubscribed_at: status === "unsubscribed" ? now : null,
    })
    .eq("audience_id", audienceId);
  await emitEvent(
    supabase,
    audienceId,
    status === "active" ? "resubscribed" : "unsubscribed",
    { via: "admin" }
  );
  await refreshTags(supabase, audienceId);

  if (existing && prevTier) {
    const newTier = deriveTier({
      subscriber_status: status,
      user_id: existing.user_id,
      lifetime_orders: existing.lifetime_orders,
    });
    if (newTier !== prevTier) {
      void notifyTierChange(
        {
          audience_id: audienceId,
          email: existing.email,
          display_name: existing.display_name,
          tier: newTier,
          source: "admin action",
          lifetime_orders: existing.lifetime_orders,
          lifetime_spend: existing.lifetime_spend,
        },
        prevTier
      );
    }
  }
}

/* Email events from the Resend webhook (delivered/opened/clicked/bounced/
   complained). Bumps audience aggregates so engagement_score recomputes
   correctly. */
export async function recordEmailEvent(opts: {
  audienceId: string;
  eventType:
    | "email_sent"
    | "email_delivered"
    | "email_opened"
    | "email_clicked"
    | "email_bounced"
    | "email_complained";
  metadata?: Record<string, unknown>;
  isFirstOpen?: boolean;
  isFirstClick?: boolean;
}): Promise<void> {
  const supabase = createAdminClient();
  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { updated_at: now };

  // We can't easily atomic-increment via the JS client without an RPC,
  // so read-then-write. At chad's scale (low write rate) this is fine.
  const { data: row } = await supabase
    .from("audience")
    .select("emails_received, emails_opened, emails_clicked")
    .eq("id", opts.audienceId)
    .single();
  if (!row) return;

  if (opts.eventType === "email_delivered") {
    updates.emails_received = row.emails_received + 1;
  }
  if (opts.eventType === "email_opened") {
    updates.last_opened_at = now;
    if (opts.isFirstOpen) updates.emails_opened = row.emails_opened + 1;
  }
  if (opts.eventType === "email_clicked") {
    updates.last_clicked_at = now;
    if (opts.isFirstClick) updates.emails_clicked = row.emails_clicked + 1;
  }

  await supabase.from("audience").update(updates).eq("id", opts.audienceId);
  await emitEvent(supabase, opts.audienceId, opts.eventType, opts.metadata);
  await refreshTags(supabase, opts.audienceId);
}

/* Free-form tag management for the admin UI. */
export async function addTag(audienceId: string, tag: string): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from("audience_tags")
    .insert({ audience_id: audienceId, tag })
    .select();
  await emitEvent(supabase, audienceId, "tag_added", { tag });
}

export async function removeTag(audienceId: string, tag: string): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from("audience_tags")
    .delete()
    .eq("audience_id", audienceId)
    .eq("tag", tag);
  await emitEvent(supabase, audienceId, "tag_removed", { tag });
}

// Cookie-consent persistence for signed-in fans. The cl_cookie_consent cookie
// is the runtime source of truth; this mirrors the choice onto the account so
// it follows the fan across devices. NULL columns = not yet chosen.
export async function setConsent(
  audienceId: string,
  consent: { functional: boolean; analytics: boolean; marketing: boolean },
): Promise<void> {
  const supabase = createAdminClient();
  const now = new Date().toISOString();
  await supabase
    .from("audience")
    .update({
      consent_functional: consent.functional,
      consent_analytics: consent.analytics,
      consent_marketing: consent.marketing,
      consent_updated_at: now,
      updated_at: now,
    })
    .eq("id", audienceId);
  await emitEvent(supabase, audienceId, "consent_updated", {
    functional: consent.functional,
    analytics: consent.analytics,
    marketing: consent.marketing,
    via: "account",
  });
}

export async function getConsent(
  audienceId: string,
): Promise<{ functional: boolean; analytics: boolean; marketing: boolean } | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("audience")
    .select("consent_analytics, consent_functional, consent_marketing")
    .eq("id", audienceId)
    .maybeSingle();
  if (!data || data.consent_analytics === null || data.consent_analytics === undefined) {
    return null; // not yet chosen on this account
  }
  return {
    functional: !!data.consent_functional,
    analytics: !!data.consent_analytics,
    marketing: !!data.consent_marketing,
  };
}

export async function setMailingAddress(
  audienceId: string,
  address: MailingAddress
): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from("audience")
    .update({
      mailing_line1: address.line1 ?? null,
      mailing_line2: address.line2 ?? null,
      mailing_city: address.city ?? null,
      mailing_state: address.state ?? null,
      mailing_postal_code: address.postal_code ?? null,
      mailing_country: address.country ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", audienceId);
  await emitEvent(createAdminClient(), audienceId, "mailing_address_updated");
}

export async function setNotes(audienceId: string, notes: string): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from("audience")
    .update({ notes, updated_at: new Date().toISOString() })
    .eq("id", audienceId);
  await emitEvent(supabase, audienceId, "note_added");
}

export async function setDisplayName(
  audienceId: string,
  displayName: string
): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from("audience")
    .update({ display_name: displayName, updated_at: new Date().toISOString() })
    .eq("id", audienceId);
  await emitEvent(supabase, audienceId, "profile_updated", { display_name: displayName });
}

/** Master name update — sets first_name + last_name explicitly and keeps
   display_name in sync as a "First Last" concat for any legacy callers. */
export async function setNames(
  audienceId: string,
  opts: { first_name?: string | null; last_name?: string | null }
): Promise<void> {
  const supabase = createAdminClient();
  const first = opts.first_name?.trim() || null;
  const last = opts.last_name?.trim() || null;
  const display = [first, last].filter(Boolean).join(" ") || null;
  await supabase
    .from("audience")
    .update({
      first_name: first,
      last_name: last,
      display_name: display,
      updated_at: new Date().toISOString(),
    })
    .eq("id", audienceId);
  await emitEvent(supabase, audienceId, "profile_updated", {
    first_name: first,
    last_name: last,
  });
}

export async function refreshAudienceTags(audienceId: string): Promise<void> {
  const supabase = createAdminClient();
  await refreshTags(supabase, audienceId);
}

/* ---- Notification category preferences ----------------------------------
   Per-subscriber opt-out for the OPTIONAL email categories. The required
   "general" category has no column -- it is governed by subscriber_status.
   See src/lib/notification-categories.ts. Like setConsent, these are pure
   preference writes: they emit a timeline event but don't touch tags/rollups. */

const PREF_COLUMNS = OPTIONAL_CATEGORIES.map((c) => c.column as string);

export type NotificationPrefMap = Record<string, boolean>;

// Map a selected audience row (column-keyed) to a category-key-keyed pref map.
// Null/undefined columns read as true to match the column default (opt-out).
function prefMapFromRow(row: Record<string, unknown> | null): NotificationPrefMap {
  const out: NotificationPrefMap = {};
  for (const c of OPTIONAL_CATEGORIES) {
    const v = row?.[c.column as string];
    out[c.key] = v === undefined || v === null ? true : !!v;
  }
  return out;
}

/* Read the optional-category prefs for an audience row (keyed by category). */
export async function getNotificationPrefs(
  audienceId: string,
): Promise<NotificationPrefMap> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("audience")
    .select(PREF_COLUMNS.join(", "))
    .eq("id", audienceId)
    .maybeSingle();
  return prefMapFromRow(data as unknown as Record<string, unknown> | null);
}

/* Update optional-category prefs by audience id. Map is keyed by category key;
   "general"/unknown keys (no column) are ignored. */
export async function setNotificationPrefs(
  audienceId: string,
  prefs: Record<string, boolean>,
): Promise<void> {
  const supabase = createAdminClient();
  const update: Record<string, unknown> = {};
  const changed: string[] = [];
  for (const [key, val] of Object.entries(prefs)) {
    const col = categoryColumn(key);
    if (col) {
      update[col] = !!val;
      changed.push(key);
    }
  }
  if (changed.length === 0) return;
  update.updated_at = new Date().toISOString();
  await supabase.from("audience").update(update).eq("id", audienceId);
  await emitEvent(supabase, audienceId, "notification_prefs_updated", { changed });
}

/* Resolve an audience row by its unsubscribe_token (reused as the prefs token,
   since it already appears in every email footer) for the public /preferences
   page. Returns null if the token doesn't match. */
export async function findAudienceForPrefsByToken(token: string): Promise<{
  id: string;
  email: string;
  subscriber_status: string;
  prefs: NotificationPrefMap;
} | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("audience")
    .select(`id, email, subscriber_status, ${PREF_COLUMNS.join(", ")}`)
    .eq("unsubscribe_token", token)
    .maybeSingle();
  if (!data) return null;
  const row = data as unknown as Record<string, unknown>;
  return {
    id: row.id as string,
    email: row.email as string,
    subscriber_status: row.subscriber_status as string,
    prefs: prefMapFromRow(row),
  };
}

/* Token-gated setter for the public /preferences page. Returns false if the
   token doesn't resolve (caller stays idempotent / doesn't leak existence). */
export async function setNotificationPrefsByToken(
  token: string,
  prefs: Record<string, boolean>,
): Promise<boolean> {
  const found = await findAudienceForPrefsByToken(token);
  if (!found) return false;
  await setNotificationPrefs(found.id, prefs);
  return true;
}
