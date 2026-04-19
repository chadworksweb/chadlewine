-- Recovery tokens: email-verified short-lived access for re-downloading past purchases.
CREATE TABLE IF NOT EXISTS recovery_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recovery_tokens_token ON recovery_tokens(token);
CREATE INDEX IF NOT EXISTS idx_recovery_tokens_email ON recovery_tokens(email);

ALTER TABLE recovery_tokens ENABLE ROW LEVEL SECURITY;
-- No public policies: service role (admin client) is the only reader/writer.

-- Existing purchases: clear the 7-day expiry so past buyers don't get locked out
-- once the new permanent-link model ships.
UPDATE purchases SET download_expires_at = NULL WHERE download_expires_at IS NOT NULL;
