-- Own-session storage for the Clerk auth migration (2026-08-22).
-- Supabase Auth is gone; Clerk is the user directory + password verifier.
-- Sessions are minted by the app: 1h HMAC access token + 30d rotating
-- refresh token whose SHA-256 hash lives here.
-- auth.users remains as the local identity table (id = the uuid the app
-- keys everything on; mirrored to Clerk as external_id).

CREATE TABLE public.auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clerk_user_id text NOT NULL,
  refresh_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  user_agent text,
  ip text
);

CREATE INDEX auth_sessions_user_id_idx ON public.auth_sessions (user_id);
CREATE INDEX auth_sessions_expires_at_idx ON public.auth_sessions (expires_at);

-- One-time tokens for emailed flows: password reset, signup email
-- verification, email change confirmation. Token itself is never stored,
-- only its SHA-256 hash.
CREATE TABLE public.auth_action_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('password_reset', 'email_verify', 'email_change')),
  token_hash text NOT NULL UNIQUE,
  payload jsonb,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX auth_action_tokens_email_idx ON public.auth_action_tokens (email);

-- Server-only tables: the service role reads and writes them, the API roles
-- never see them.
ALTER TABLE public.auth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_action_tokens ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.auth_sessions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.auth_action_tokens TO service_role;

-- New signups keep inserting auth.users rows (the register route does it
-- directly now; the old Supabase trigger is gone with Supabase).
GRANT INSERT, UPDATE ON auth.users TO service_role;
