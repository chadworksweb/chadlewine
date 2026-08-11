-- Tripwire: contract probes for chadlewine.com.
--
-- Motivated by 2026-08-11, when three faults ran silently in prod.
-- Every unsubscribe and confirm link in every email had pointed at
-- https://0.0.0.0:3006 since the move off Vercel on 2026-07-05, and
-- the fan-track player could not read a single audio segment because
-- the CDN sent no CORS header. None of it threw an exception. Every
-- route returned 200. An error ledger would have stayed green.
--
-- So Tripwire does not watch for crashes. Each check asserts an
-- observable fact about production, and trips when the fact stops
-- holding.
--
-- Two tables:
--   tripwire_runs   append-only, one row per check per execution
--   tripwire_state  current status per check; drives the panel and
--                   the alert-on-transition logic, so a broken check
--                   emails once rather than every run
--
-- Check definitions live in code (src/lib/tripwire/checks.ts), not
-- here. The DB stores results only, so adding a check is a code
-- change with no migration.
--
-- Admin-only. No anon grant: probe detail can carry signed URLs and
-- internal hostnames. Follows the RLS + GRANT pattern from
-- 20260709120000_events_cms.sql.

-- ===== tripwire_runs =====
CREATE TABLE tripwire_runs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  check_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('ok', 'fail', 'skip')),
  -- On failure this is the assertion that broke, phrased so the
  -- panel needs no interpretation.
  detail text,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- The panel's only read pattern: latest N runs for one check.
CREATE INDEX idx_tripwire_runs_check_created
  ON tripwire_runs (check_id, created_at DESC);

-- Retention sweep predicate (delete where created_at < cutoff).
CREATE INDEX idx_tripwire_runs_created ON tripwire_runs (created_at);

ALTER TABLE tripwire_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access tripwire_runs"
  ON tripwire_runs FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

GRANT ALL ON tripwire_runs TO authenticated, service_role;

-- ===== tripwire_state =====
-- One row per check, upserted by the runner. check_id is the natural
-- key; there is no surrogate id because the runner always addresses
-- a check by name.
CREATE TABLE tripwire_state (
  check_id text PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('ok', 'fail', 'skip')),
  detail text,
  -- When the CURRENT status began. Survives repeat runs at the same
  -- status, so the panel can say "failing for 3 days" instead of
  -- "failed 2 minutes ago".
  since timestamptz NOT NULL DEFAULT now(),
  last_run_at timestamptz NOT NULL DEFAULT now(),
  consecutive_failures integer NOT NULL DEFAULT 0,
  -- Set when an alert goes out, so a check that stays broken does
  -- not email on every sweep.
  last_alert_at timestamptz,
  muted boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tripwire_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access tripwire_state"
  ON tripwire_state FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

GRANT ALL ON tripwire_state TO authenticated, service_role;

CREATE TRIGGER tripwire_state_updated_at BEFORE UPDATE ON tripwire_state
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
