-- Regional manual shipping rates + per-SKU free-shipping override.
--
-- Builds on 20260525180000_manual_shipping_rates. The original
-- shipping_first_cents / shipping_addl_cents now mean the US (domestic) rate.
-- This adds Canada and Rest-of-World tiers (Bandcamp-style per-region rates)
-- plus a free_shipping_exempt flag so individual SKUs that we can never ship
-- free (e.g. vinyl drop-shipped from a UK supplier at ~$20) are excluded from
-- the free-US-shipping threshold and always charge their zone rate.
--
-- Cents, NULL = "not set" -> treated as 0 by the calculator. The free-shipping
-- threshold itself is a server constant (SHIPPING_FREE_US_THRESHOLD_CENTS),
-- not a column.

ALTER TABLE release_skus
  ADD COLUMN IF NOT EXISTS shipping_ca_first_cents  integer,
  ADD COLUMN IF NOT EXISTS shipping_ca_addl_cents   integer,
  ADD COLUMN IF NOT EXISTS shipping_row_first_cents integer,
  ADD COLUMN IF NOT EXISTS shipping_row_addl_cents  integer,
  ADD COLUMN IF NOT EXISTS free_shipping_exempt     boolean NOT NULL DEFAULT false;

ALTER TABLE song_skus
  ADD COLUMN IF NOT EXISTS shipping_ca_first_cents  integer,
  ADD COLUMN IF NOT EXISTS shipping_ca_addl_cents   integer,
  ADD COLUMN IF NOT EXISTS shipping_row_first_cents integer,
  ADD COLUMN IF NOT EXISTS shipping_row_addl_cents  integer,
  ADD COLUMN IF NOT EXISTS free_shipping_exempt     boolean NOT NULL DEFAULT false;

ALTER TABLE merch
  ADD COLUMN IF NOT EXISTS shipping_ca_first_cents  integer,
  ADD COLUMN IF NOT EXISTS shipping_ca_addl_cents   integer,
  ADD COLUMN IF NOT EXISTS shipping_row_first_cents integer,
  ADD COLUMN IF NOT EXISTS shipping_row_addl_cents  integer,
  ADD COLUMN IF NOT EXISTS free_shipping_exempt     boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN release_skus.shipping_first_cents IS
  'Manual fulfillment, US/domestic: first-item shipping in cents. NULL = free.';
COMMENT ON COLUMN release_skus.free_shipping_exempt IS
  'When true, this SKU always charges its zone shipping rate and is excluded from the free-US-shipping threshold (e.g. drop-shipped from overseas).';
COMMENT ON COLUMN song_skus.free_shipping_exempt IS
  'When true, this SKU always charges its zone shipping rate and is excluded from the free-US-shipping threshold.';
COMMENT ON COLUMN merch.free_shipping_exempt IS
  'When true, this product always charges its zone shipping rate and is excluded from the free-US-shipping threshold.';
