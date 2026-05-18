-- Add 'demo' status to songs + vaulted substate + voting/investment mechanics.
--
-- Semantics:
--   draft       = admin-only.
--   demo        = publicly visible, peer status with unreleased/published.
--                 Substate `demo_surfaced`:
--                   false → vaulted (listed publicly, audio NOT surfaced)
--                   true  → regular demo (audio playable)
--   unreleased  = unchanged.
--   published   = unchanged.
--
-- Visibility transitions remain admin-controlled. Votes/investment are signal,
-- never automatic.

-- 1) Extend status CHECK
ALTER TABLE songs DROP CONSTRAINT IF EXISTS songs_status_check;
ALTER TABLE songs ADD CONSTRAINT songs_status_check
  CHECK (status IN ('draft', 'demo', 'unreleased', 'published'));

-- 2) Demo substate + aggregate signal columns on songs
ALTER TABLE songs
  ADD COLUMN IF NOT EXISTS demo_surfaced BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS demo_vote_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS demo_investment_score INT NOT NULL DEFAULT 0;

-- 3) RLS — public can read demo songs alongside unreleased + published
DROP POLICY IF EXISTS "Public read releasable songs" ON songs;
CREATE POLICY "Public read releasable songs" ON songs
  FOR SELECT USING (status IN ('demo', 'unreleased', 'published'));

-- 4) Votes table — one row per (voter, song, vote_index)
CREATE TABLE IF NOT EXISTS song_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  song_id UUID NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  voter_id TEXT NOT NULL,
  vote_index INT NOT NULL CHECK (vote_index >= 1),
  activation_type TEXT NOT NULL,
  activation_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT song_votes_activation_type_check
    CHECK (activation_type IN ('free', 'payment', 'share', 'other')),
  -- vote_index=1 must be free; vote_index>=2 must be a paid/share/other activation
  CONSTRAINT song_votes_index_activation_check
    CHECK (
      (vote_index = 1 AND activation_type = 'free')
      OR (vote_index >= 2 AND activation_type IN ('payment', 'share', 'other'))
    ),
  CONSTRAINT song_votes_unique_per_voter UNIQUE (song_id, voter_id, vote_index)
);

CREATE INDEX IF NOT EXISTS song_votes_song_id_idx ON song_votes(song_id);
CREATE INDEX IF NOT EXISTS song_votes_voter_song_idx ON song_votes(voter_id, song_id);

-- 5) Trigger maintains aggregates on songs (denormalized for read perf).
--    Activation weight is the only place "investment" is quantified.
CREATE OR REPLACE FUNCTION update_song_vote_aggregates()
RETURNS TRIGGER AS $$
DECLARE
  weight INT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    weight := CASE NEW.activation_type
      WHEN 'free'    THEN 1
      WHEN 'share'   THEN 3
      WHEN 'payment' THEN 10
      ELSE 1
    END;
    UPDATE songs
      SET demo_vote_count = demo_vote_count + 1,
          demo_investment_score = demo_investment_score + weight
      WHERE id = NEW.song_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    weight := CASE OLD.activation_type
      WHEN 'free'    THEN 1
      WHEN 'share'   THEN 3
      WHEN 'payment' THEN 10
      ELSE 1
    END;
    UPDATE songs
      SET demo_vote_count       = GREATEST(0, demo_vote_count - 1),
          demo_investment_score = GREATEST(0, demo_investment_score - weight)
      WHERE id = OLD.song_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS song_votes_aggregate_trigger ON song_votes;
CREATE TRIGGER song_votes_aggregate_trigger
  AFTER INSERT OR DELETE ON song_votes
  FOR EACH ROW EXECUTE FUNCTION update_song_vote_aggregates();

-- 6) song_votes RLS — locked down. Public sees only the aggregates on songs.
--    Service role (admin client + /api/votes route) bypasses RLS.
ALTER TABLE song_votes ENABLE ROW LEVEL SECURITY;
