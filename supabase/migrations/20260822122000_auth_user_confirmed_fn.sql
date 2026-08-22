-- Login gate for email confirmation (2026-08-22, Clerk auth migration).
-- Clerk auto-verifies Backend-API-created addresses and refuses to
-- un-verify a user's only email, so Clerk can't carry the "confirmed
-- your signup email" bit. auth.users.email_confirmed_at is the truth:
-- imports brought it over from Supabase, the verify-email route stamps
-- it, and login checks it through this function.

CREATE OR REPLACE FUNCTION public.auth_user_confirmed(p_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = auth, public AS $$
  SELECT email_confirmed_at IS NOT NULL FROM auth.users WHERE id = p_id;
$$;

REVOKE ALL ON FUNCTION public.auth_user_confirmed(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_user_confirmed(uuid) TO service_role;
