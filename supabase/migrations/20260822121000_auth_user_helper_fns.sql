-- auth.users write helpers (2026-08-22, Clerk auth migration).
-- PostgREST only exposes the public schema, so the app manages its
-- auth.users identity rows through these SECURITY DEFINER functions.
-- Service-role only; the API roles can't touch them.

CREATE OR REPLACE FUNCTION public.auth_user_insert(p_id uuid, p_email text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = auth, public AS $$
  INSERT INTO auth.users (id, email, created_at)
  VALUES (p_id, lower(p_email), now());
$$;

CREATE OR REPLACE FUNCTION public.auth_user_confirm_email(p_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = auth, public AS $$
  UPDATE auth.users SET email_confirmed_at = now() WHERE id = p_id;
$$;

CREATE OR REPLACE FUNCTION public.auth_user_update_email(p_id uuid, p_email text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = auth, public AS $$
  UPDATE auth.users SET email = lower(p_email) WHERE id = p_id;
$$;

CREATE OR REPLACE FUNCTION public.auth_user_delete(p_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = auth, public AS $$
  DELETE FROM auth.users WHERE id = p_id;
$$;

REVOKE ALL ON FUNCTION public.auth_user_insert(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.auth_user_confirm_email(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.auth_user_update_email(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.auth_user_delete(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_user_insert(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.auth_user_confirm_email(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.auth_user_update_email(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.auth_user_delete(uuid) TO service_role;
