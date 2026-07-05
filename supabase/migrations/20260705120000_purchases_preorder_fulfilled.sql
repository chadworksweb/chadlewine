-- Preorder delivery: mark when a purchase has had its "preorder is out"
-- email sent + downloads opened, so the manual Deliver Preorder push is
-- idempotent (re-running never double-emails a buyer).
ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS preorder_fulfilled_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_purchases_preorder_fulfilled
  ON purchases(preorder_fulfilled_at);
