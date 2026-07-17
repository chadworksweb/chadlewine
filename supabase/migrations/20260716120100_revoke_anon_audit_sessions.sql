-- revoke_anon_audit_sessions
--
-- audit_sessions picked up Supabase's default anon grants on creation (this
-- project predates the default-grant removal). RLS already blocks anon -- the
-- only policy is admin-only -- but this table carries session notes and Stripe
-- payment identifiers, so it should not depend on RLS alone. Nothing anon-side
-- touches it: the public hold submit goes through a service-role API route.
--
-- Note: event_rsvps carries the same default anon grants. Left alone here
-- rather than changed as a side effect of this feature.

REVOKE ALL ON audit_sessions FROM anon;
