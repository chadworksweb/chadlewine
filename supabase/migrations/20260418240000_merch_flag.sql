-- Add the 'merch' feature flag so the store section can be toggled from
-- /admin/launch-control. When off, proxy.ts rewrites /merch/* to /preview.
INSERT INTO feature_flags (section, is_live) VALUES
  ('merch', FALSE)
ON CONFLICT (section) DO NOTHING;
