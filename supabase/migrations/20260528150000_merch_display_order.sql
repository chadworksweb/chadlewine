-- Manual ordering for the storefront. Lower display_order = earlier in the
-- grid. Backfilled so the initial "Featured" order matches the existing
-- "Newest" order (created_at desc), then admin can drag to reorder on
-- /admin/merch.

ALTER TABLE merch
  ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_merch_display_order ON merch(display_order);

WITH ranked AS (
  SELECT id, row_number() OVER (ORDER BY created_at DESC) AS rn
  FROM merch
)
UPDATE merch m
SET display_order = r.rn
FROM ranked r
WHERE m.id = r.id
  AND m.display_order = 0;
