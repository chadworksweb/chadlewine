-- media_meta was created (2026-04-23) before this project's explicit-GRANT
-- convention: RLS is enabled but service_role was never granted table access.
-- Once default privileges were tightened, the admin client (service_role) could
-- no longer read or write the table, so alt_text/title silently came back empty
-- in the Media Library and saves never persisted. Grant the admin role
-- explicitly, matching the pattern used by every table created since 2026-05-16.
-- See: src/app/api/admin/media/route.ts

grant all on table public.media_meta to service_role;
