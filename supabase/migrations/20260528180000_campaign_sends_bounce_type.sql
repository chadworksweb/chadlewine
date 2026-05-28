-- Distinguish hard (permanent) vs soft (transient) bounces so the campaign
-- results table can flag them, and so only hard bounces trigger the unsubscribe
-- scrub. Populated by the Resend webhook from the bounce event's `type`.
-- See: src/app/api/webhooks/resend/route.ts

alter table public.campaign_sends add column if not exists bounce_type text;
