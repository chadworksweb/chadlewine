-- Voice profile table — single row, editable from admin
CREATE TABLE IF NOT EXISTS voice_profile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: public read (for API routes), authenticated full access
ALTER TABLE voice_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "voice_profile_public_read" ON voice_profile FOR SELECT USING (true);
CREATE POLICY "voice_profile_admin_all" ON voice_profile FOR ALL USING (auth.role() = 'authenticated');

-- Seed with the initial voice profile content
INSERT INTO voice_profile (content) VALUES ('');
