-- Structured call-to-action button for campaign emails. Stored separately
-- from body_html so the composer can render the proven bulletproof
-- table-as-button pattern at send time (Gmail strips the simpler
-- <a> with background+padding pattern on first render).

alter table public.campaigns
  add column if not exists cta_label text,
  add column if not exists cta_url text;
