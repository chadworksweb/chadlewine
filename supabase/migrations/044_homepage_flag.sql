-- Add the 'homepage' feature flag. When off, proxy.ts rewrites / to /preview on production.
INSERT INTO feature_flags (section, is_live) VALUES
  ('homepage', FALSE)
ON CONFLICT (section) DO NOTHING;
