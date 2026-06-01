-- ============================================================
-- NOTIFICATION CATEGORIES (per-subscriber email preferences)
-- Granular opt-out controls on top of the master subscriber_status.
--
-- Model:
--   * subscriber_status='active'  = master marketing consent (the only
--     off-switch for the required "General" category, and the legal
--     one-click unsubscribe kill switch).
--   * The 6 OPTIONAL categories below are stored as boolean columns on
--     audience, default true (opt-out model). A campaign tagged with one of
--     these categories skips any row whose matching column is false.
--   * "General" has no column -- general/null-category campaigns go to every
--     active subscriber. It can only be turned off via the master unsubscribe.
--   * Transactional / TOS / legal emails never flow through campaigns, so
--     they are exempt from all of this and always send.
--
-- audience already has RLS ("Audience self-read/self-update", "Admin all
-- audience") and campaigns has "Admin all campaigns" (migrations
-- 20260513150000 / 20260513120000). All writes go through the service-role
-- admin client, so -- as with 20260530170000_audience_consent.sql -- these
-- column adds need no new grants or policies.
-- ============================================================

-- Optional categories on the master contact record. Default true so every
-- existing subscriber stays opted into everything (ADD COLUMN ... DEFAULT
-- backfills existing rows).
alter table public.audience
  add column if not exists notify_new_releases       boolean not null default true,
  add column if not exists notify_archive_highlights boolean not null default true,
  add column if not exists notify_curated            boolean not null default true,
  add column if not exists notify_observations       boolean not null default true,
  add column if not exists notify_merch              boolean not null default true,
  add column if not exists notify_live_shows         boolean not null default true;

-- Per-campaign category. 'general' (the default) reaches all active
-- subscribers; the 6 optional keys gate on the matching audience column.
alter table public.campaigns
  add column if not exists category text not null default 'general';

-- Add a "Manage email preferences" link to the shared email footer, right
-- below the existing Unsubscribe block. The block footer (email_globals,
-- migration 20260516140000) was seeded once with ON CONFLICT DO NOTHING, so a
-- fresh seed won't touch the live row -- append here instead. Like the
-- unsubscribe block it carries hidden_if_unset_var so it stays out of
-- transactional sends (which never set {{ preferences_url }}). Idempotent: the
-- guard skips rows that already reference preferences_url.
update public.email_globals
set footer_blocks = footer_blocks || jsonb_build_array(
  jsonb_build_object(
    'id', gen_random_uuid()::text,
    'type', 'paragraph',
    'html', '<a href="{{ preferences_url }}" style="color:#8b9cf7;">Manage email preferences</a>',
    'size', 'small',
    'hidden_if_unset_var', 'preferences_url'
  )
)
where id = 1
  and footer_blocks::text not like '%preferences_url%';
