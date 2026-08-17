-- NEW badge on merch cards.
-- Manual switch per product, not derived from created_at:
-- a restock or a re-shoot can be "new" long after the row was made,
-- and a slow seller shouldn't wear the badge forever.

ALTER TABLE merch
  ADD COLUMN IF NOT EXISTS is_new boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN merch.is_new IS
  'Shows the NEW badge on the merch card. Toggled in the admin.';
