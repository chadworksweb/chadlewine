ALTER TABLE products ADD COLUMN IF NOT EXISTS variants jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;
