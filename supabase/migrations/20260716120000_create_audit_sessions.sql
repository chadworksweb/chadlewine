-- create_audit_sessions
--
-- Sovereignty Audit sessions. One row per hold, carried from checkout through
-- settlement. The client pays 10 minutes up front to hold the spot, the session
-- runs until they end it (120 min ceiling), and the balance auto-charges to the
-- saved card the moment it ends.
--
-- Billing math lives in src/lib/audit-rate.ts. This table stores results, it
-- does not recompute them.
--
-- rate_cents_per_min holds the BASE rate (525), not the effective one. It is an
-- integer and the launch rate is 262.5 cents, so the effective rate would round
-- to 263 if stored here. launch_discount carries the 50%; settle derives the
-- effective rate from the pair. Snapshotting both per row means a session still
-- settles at the rate it was sold at, even after launch pricing ends.
--
-- Follows the RLS + GRANT + update_updated_at trigger pattern from
-- 20260709120000_events_cms.sql. Private table: it carries session notes and
-- payment identifiers, so anon gets NO direct grant. The public hold submit
-- goes through a service-role API route, same as event_rsvps.

CREATE TABLE audit_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audience_id uuid REFERENCES audience(id) ON DELETE SET NULL,
  email text NOT NULL,
  name text,
  status text NOT NULL DEFAULT 'held'
    CHECK (status IN ('held', 'scheduled', 'in_progress', 'complete', 'settled', 'settle_failed', 'no_show', 'void')),
  scheduled_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  billed_minutes integer CHECK (billed_minutes IS NULL OR (billed_minutes >= 0 AND billed_minutes <= 120)),
  rate_cents_per_min integer NOT NULL DEFAULT 525,
  launch_discount boolean NOT NULL DEFAULT true,
  hold_cents integer NOT NULL,
  total_cents integer,
  balance_cents integer CHECK (balance_cents IS NULL OR balance_cents >= 0),
  stripe_customer_id text,
  stripe_payment_method_id text,
  stripe_hold_payment_intent text,
  stripe_balance_payment_intent text,
  stripe_balance_invoice_id text,
  balance_due_at timestamptz,
  settle_error text,
  agreement_accepted_at timestamptz,
  agreement_version text,
  primary_locus text CHECK (primary_locus IS NULL OR primary_locus IN ('L1', 'L3', 'L5')),
  blueprint_url text,
  blueprint_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_sessions_status ON audit_sessions(status, created_at DESC);
CREATE INDEX idx_audit_sessions_email ON audit_sessions(lower(email));
CREATE INDEX idx_audit_sessions_hold_pi ON audit_sessions(stripe_hold_payment_intent);

ALTER TABLE audit_sessions ENABLE ROW LEVEL SECURITY;

-- Admin only. The public hold submit goes through a service-role API route, so
-- no anon grant here (session notes and payment ids stay private).
CREATE POLICY "Admin full access audit_sessions"
  ON audit_sessions FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

GRANT ALL ON audit_sessions TO authenticated, service_role;

CREATE TRIGGER audit_sessions_updated_at BEFORE UPDATE ON audit_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
