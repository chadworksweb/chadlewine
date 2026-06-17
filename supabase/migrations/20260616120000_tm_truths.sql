-- Transcend the Machine: the truths a player types at the L5 ego climax
-- ("type your own truth"), logged to their account. Written server-side by the
-- service role (see /api/transcend/truth), which authenticates the player from
-- their sb-access-token cookie. RLS on with no anon/authenticated policies, so
-- only the service role (and admin tooling) can touch it.

CREATE TABLE tm_truths (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  email text,
  level int NOT NULL,
  layer text,
  truth text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX tm_truths_user_idx ON tm_truths (user_id);

ALTER TABLE tm_truths ENABLE ROW LEVEL SECURITY;

GRANT ALL ON tm_truths TO service_role;
