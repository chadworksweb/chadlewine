-- Tripwire: attribute every run and every state row to an environment.
--
-- Prod and staging share one Supabase, and local dev points at the same
-- project. tripwire_state was keyed on check_id alone, so whichever
-- environment swept last owned the row: a sweep from localhost silently
-- overwrote prod's board, and the run log mixed all three with no way
-- to tell them apart. RC's Faultline carries an `environment` column for
-- exactly this reason; it should have been here from the start.
--
-- Backfill is exact rather than guessed. Every run before 16:00 UTC on
-- 2026-08-11 came from the local dev server during the build; the 16:18
-- and 16:19 rows are the first prod sweep. The state rows were last
-- written by that prod sweep.

-- ===== tripwire_runs =====
ALTER TABLE tripwire_runs
  ADD COLUMN environment text NOT NULL DEFAULT 'local';

ALTER TABLE tripwire_runs
  ADD CONSTRAINT tripwire_runs_environment_check
  CHECK (environment IN ('local', 'staging', 'prod'));

UPDATE tripwire_runs
  SET environment = 'prod'
  WHERE created_at >= '2026-08-11T16:00:00Z';

-- The panel's read pattern is now scoped by environment first.
DROP INDEX IF EXISTS idx_tripwire_runs_check_created;

CREATE INDEX idx_tripwire_runs_env_check_created
  ON tripwire_runs (environment, check_id, created_at DESC);

-- ===== tripwire_state =====
ALTER TABLE tripwire_state
  ADD COLUMN environment text NOT NULL DEFAULT 'local';

ALTER TABLE tripwire_state
  ADD CONSTRAINT tripwire_state_environment_check
  CHECK (environment IN ('local', 'staging', 'prod'));

-- Existing rows were last written by the first prod sweep.
UPDATE tripwire_state SET environment = 'prod';

-- One board per environment: the key is the pair, not the check alone.
ALTER TABLE tripwire_state DROP CONSTRAINT tripwire_state_pkey;

ALTER TABLE tripwire_state
  ADD CONSTRAINT tripwire_state_pkey
  PRIMARY KEY (environment, check_id);
