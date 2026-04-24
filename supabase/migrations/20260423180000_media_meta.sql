-- media_meta: per-file alt text and title keyed by filename.
-- The table was previously created ad-hoc in the Supabase dashboard with no
-- migration source of truth. This migration captures its schema so the repo
-- is authoritative. Idempotent against the existing live table.
-- See: src/app/api/admin/media/route.ts

CREATE TABLE IF NOT EXISTS media_meta (
  filename text PRIMARY KEY,
  alt_text text NOT NULL DEFAULT '',
  title text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE media_meta ADD COLUMN IF NOT EXISTS alt_text text NOT NULL DEFAULT '';
ALTER TABLE media_meta ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT '';
ALTER TABLE media_meta ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE media_meta ENABLE ROW LEVEL SECURITY;
-- No public policies: service role (admin client) is the only reader/writer.
