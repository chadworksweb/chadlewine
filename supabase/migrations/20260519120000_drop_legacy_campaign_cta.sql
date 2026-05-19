-- Retire legacy campaigns.cta_label / cta_url columns.
--
-- These were added in 20260516120000_campaign_cta.sql as a one-shot
-- "render a button after the body_html" feature. The block-based email
-- editor (20260516140000_email_blocks.sql) supersedes them: every
-- campaign now carries body_blocks, and button blocks render the CTA.
--
-- The application layer no longer reads these columns. CampaignEditor's
-- useState initializer lifts any non-null cta_label/cta_url into a
-- button block on first edit, so legacy drafts opened after this
-- migration's code change preserve their CTA as a block.
--
-- DO NOT APPLY until you confirm no draft campaigns still depend on
-- the legacy fields:
--
--   select id, subject, status, body_blocks
--     from campaigns
--    where (cta_label is not null or cta_url is not null)
--      and (body_blocks is null
--           or jsonb_typeof(body_blocks) <> 'array'
--           or jsonb_array_length(body_blocks) = 0);
--
-- If the above returns zero rows, every campaign either has no CTA or
-- has the CTA preserved in body_blocks already. Safe to apply.

alter table public.campaigns drop column if exists cta_label;
alter table public.campaigns drop column if exists cta_url;
