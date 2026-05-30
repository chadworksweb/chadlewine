-- Cookie-consent persistence for signed-in fans.
--
-- The `cl_cookie_consent` cookie is the runtime source of truth; these columns
-- let a logged-in fan's choice follow them across devices (re-seeded into the
-- cookie on login by ConsentProvider). NULL = not yet chosen on the account.
--
-- public.audience already has RLS enabled with "Audience self-read",
-- "Audience self-update", and "Admin all audience" policies (migration
-- 20260513150000), and the consent API writes via the service-role admin
-- client, so no new grants/policies are required for these columns.

alter table public.audience
  add column if not exists consent_analytics boolean,
  add column if not exists consent_functional boolean,
  add column if not exists consent_marketing boolean,
  add column if not exists consent_updated_at timestamptz;
