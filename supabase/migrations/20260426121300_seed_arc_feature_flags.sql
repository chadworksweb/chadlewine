-- Arc Radiant v1 / migration 14 of 14
-- Seeds the prose-view flag. The arc itself rides the existing 'chad-lewine'
-- flag (no new flag for the arc). Per §12 and audit Q3, the prose flag is
-- enforced inside src/app/(public)/chad-lewine/page.tsx (not in proxy.ts),
-- since proxy.ts maps one flag per first-path-segment and ?view=prose is a
-- sub-view of the same path.
--
-- Both flags start is_live=false; flip via /admin/launch-control when ready.

INSERT INTO feature_flags (section, is_live) VALUES
  ('chad-lewine-prose', FALSE)
ON CONFLICT (section) DO NOTHING;

-- Ensure 'chad-lewine' exists (created in migration 043, defensive re-insert)
INSERT INTO feature_flags (section, is_live) VALUES
  ('chad-lewine', FALSE)
ON CONFLICT (section) DO NOTHING;
