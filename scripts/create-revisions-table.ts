/**
 * Create observation_revisions table via Supabase pg_net or direct connection.
 * Run with: source .env.local && npx tsx scripts/create-revisions-table.ts
 */
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing env vars.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  // Test if the table already exists by querying it
  const { error: testError } = await supabase
    .from("observation_revisions")
    .select("id")
    .limit(1);

  if (!testError) {
    console.log("Table observation_revisions already exists.");
    return;
  }

  if (testError.code !== "PGRST205") {
    console.error("Unexpected error:", testError);
    return;
  }

  // Table doesn't exist — need to create it via SQL
  // The Supabase JS client can't run DDL. Use the management API.
  const projectRef = supabaseUrl.replace("https://", "").replace(".supabase.co", "");

  console.log("Table does not exist. Run this SQL in the Supabase Dashboard SQL Editor:");
  console.log(`URL: https://supabase.com/dashboard/project/${projectRef}/sql/new\n`);
  console.log(`
CREATE TABLE IF NOT EXISTS observation_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  observation_id uuid NOT NULL REFERENCES observations(id) ON DELETE CASCADE,
  body text NOT NULL,
  title text NOT NULL,
  revision_number integer NOT NULL DEFAULT 1,
  change_summary text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_revisions_observation
  ON observation_revisions(observation_id, created_at DESC);

ALTER TABLE observation_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read revisions" ON observation_revisions
  FOR SELECT USING (true);

CREATE POLICY "Service role write revisions" ON observation_revisions
  FOR INSERT WITH CHECK (true);
  `);
}

main();
