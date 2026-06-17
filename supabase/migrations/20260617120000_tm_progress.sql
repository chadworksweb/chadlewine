-- Transcend the Machine: per-player progress + the secret-song unlock ledger
-- (design doc Section 11). Written server-side by the service role
-- (/api/transcend/progress and /api/transcend/complete), which authenticates a
-- signed-in player from their sb-access-token cookie and resolves them to an
-- audience row; anon play is keyed by a client-generated session id stored in
-- localStorage. RLS on with no anon/authenticated policies, so only the service
-- role (and admin tooling) can touch these tables.

CREATE TABLE tm_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audience_id uuid,                       -- audience.id for signed-in play; null for anon
  session_id text,                        -- client-generated id for anon continuity
  current_level int NOT NULL DEFAULT 1,   -- furthest level reached (1..5)
  inventory jsonb NOT NULL DEFAULT '{}'::jsonb,  -- e.g. {"key":true,"rune":true}
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  secret_found boolean NOT NULL DEFAULT false,
  secret_unlocked boolean NOT NULL DEFAULT false,  -- after shares / pay / patron
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One row per player: keyed by audience_id when signed in, else by session_id.
CREATE UNIQUE INDEX tm_progress_audience_uidx ON tm_progress (audience_id) WHERE audience_id IS NOT NULL;
CREATE UNIQUE INDEX tm_progress_session_uidx ON tm_progress (session_id) WHERE audience_id IS NULL;

ALTER TABLE tm_progress ENABLE ROW LEVEL SECURITY;

GRANT ALL ON tm_progress TO service_role;

CREATE TABLE tm_secret_unlocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audience_id uuid,
  session_id text,
  method text NOT NULL,                    -- shares | purchase | patron
  stripe_payment_intent_id text,
  share_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX tm_secret_unlocks_audience_idx ON tm_secret_unlocks (audience_id);
CREATE INDEX tm_secret_unlocks_session_idx ON tm_secret_unlocks (session_id);

ALTER TABLE tm_secret_unlocks ENABLE ROW LEVEL SECURITY;

GRANT ALL ON tm_secret_unlocks TO service_role;
