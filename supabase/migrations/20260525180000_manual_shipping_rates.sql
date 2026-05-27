-- Manual shipping rates for self-fulfilled physical goods.
-- Printify lines get destination-aware quotes from the Printify API at
-- checkout; manual lines (vinyl/cd/cassette Chad ships himself, hand-shipped
-- originals/merch) need rates he sets. We mirror Printify's own structure:
-- a first-item charge plus a smaller per-additional-item add-on, so a mixed
-- box is modeled as max(first across manual lines) + each other line's addl.
-- Cents to match Stripe + the merch.variants price_cents convention. NULL
-- means "not set" and is treated as 0 (free) by the calculator.

ALTER TABLE release_skus
  ADD COLUMN IF NOT EXISTS shipping_first_cents integer,
  ADD COLUMN IF NOT EXISTS shipping_addl_cents  integer;

ALTER TABLE song_skus
  ADD COLUMN IF NOT EXISTS shipping_first_cents integer,
  ADD COLUMN IF NOT EXISTS shipping_addl_cents  integer;

ALTER TABLE merch
  ADD COLUMN IF NOT EXISTS shipping_first_cents integer,
  ADD COLUMN IF NOT EXISTS shipping_addl_cents  integer;

COMMENT ON COLUMN release_skus.shipping_first_cents IS
  'Manual fulfillment only: shipping charged for the first manual item, in cents. NULL = free.';
COMMENT ON COLUMN release_skus.shipping_addl_cents IS
  'Manual fulfillment only: add-on per additional manual item in the same order, in cents. NULL = free.';
COMMENT ON COLUMN song_skus.shipping_first_cents IS
  'Manual fulfillment only: shipping charged for the first manual item, in cents. NULL = free.';
COMMENT ON COLUMN song_skus.shipping_addl_cents IS
  'Manual fulfillment only: add-on per additional manual item in the same order, in cents. NULL = free.';
COMMENT ON COLUMN merch.shipping_first_cents IS
  'Manual fulfillment only: shipping charged for the first manual item, in cents. NULL = free.';
COMMENT ON COLUMN merch.shipping_addl_cents IS
  'Manual fulfillment only: add-on per additional manual item in the same order, in cents. NULL = free.';

-- Order-level fulfillment split. has_printify_lines already exists; add a
-- manual-physical flag so the admin queue distinguishes lines Chad ships
-- himself from Printify pushes, and so the webhook can route either to
-- pending_review.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS has_manual_physical_lines boolean NOT NULL DEFAULT false;
