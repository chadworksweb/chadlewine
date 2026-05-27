-- Add UK (GB) as its own manual-shipping zone, separate from Rest-of-World.
-- Chad's vinyl is pressed/shipped from the UK, so GB is his cheapest, most
-- common international destination ($15) and shouldn't share a rate with
-- AU/NZ/IE (which he can't yet price). Zones are now US / CA / UK / ROW.
-- NULL = not set -> treated as 0 by the calculator.

ALTER TABLE release_skus
  ADD COLUMN IF NOT EXISTS shipping_uk_first_cents integer,
  ADD COLUMN IF NOT EXISTS shipping_uk_addl_cents  integer;

ALTER TABLE song_skus
  ADD COLUMN IF NOT EXISTS shipping_uk_first_cents integer,
  ADD COLUMN IF NOT EXISTS shipping_uk_addl_cents  integer;

ALTER TABLE merch
  ADD COLUMN IF NOT EXISTS shipping_uk_first_cents integer,
  ADD COLUMN IF NOT EXISTS shipping_uk_addl_cents  integer;
