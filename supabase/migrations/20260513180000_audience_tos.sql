-- Record TOS acceptance at registration time. Required for new accounts
-- (see /api/account/register). Stored as a timestamp so we have an audit
-- date — null means never accepted (legacy backfilled audience rows).
alter table public.audience
  add column if not exists tos_accepted_at timestamptz;
