-- Subdivide demo songs by recording type. This is orthogonal to demo_type
-- (which holds the vote/sponsor go-to-market mechanic). demo_format describes
-- what kind of demo recording a song IS.
--
-- First two formats:
--   diy_production  = produced but never fully finished/mixed properly.
--   acapella_sketch = vocal-only sketch.
--
-- Nullable: non-demo songs and demos with no format chosen leave it unset.
-- Column inherits the songs table grants + RLS, so no new grant block needed.

ALTER TABLE songs
  ADD COLUMN IF NOT EXISTS demo_format TEXT
    CHECK (demo_format IN ('diy_production', 'acapella_sketch'));
