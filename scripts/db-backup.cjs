// Daily logical backup of the chadlewine Supabase database.
//
// No Supabase Pro tier = no managed backups / PITR, so this is the ONLY DB
// backup. Dependency-free (uses the `pg` client already in node_modules); no
// pg_dump required. Dumps every row of every public table plus auth.users,
// losslessly, via Postgres' own json serialization (row_to_json/json_agg), so
// jsonb (beat_data, synth_envelopes), float8[] (envelopes), timestamps, and
// nulls all round-trip exactly. Schema lives in supabase/migrations (in git);
// a compact column manifest is included so each dump is self-describing.
//
// Output: <Dropbox>\Backups\chadlewine-db\chadlewine-YYYY-MM-DD.json.gz
// Retention: keeps the most recent 30 daily dumps.
//
// Auth: reads PGPASSWORD from the environment, or from the local-only file
//   %USERPROFILE%\.chadlewine-backup\db.env   (KEY=VALUE; NOT in the repo).
// Rotate the DB password -> update that one file.
//
// Run manually:  node scripts/db-backup.cjs
// Scheduled daily by the "chadlewine-db-backup" Windows task.

const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");
const { Client } = require("pg");

const HOST = "db.dyjvcjbgnvjkubrsqnym.supabase.co";
const PORT = 5432;
const USER = "postgres";
const DATABASE = "postgres";
const OUT_DIR = path.join(os.homedir(), "Dropbox", "Backups", "chadlewine-db");
const RETAIN = 30;

function loadPassword() {
  if (process.env.PGPASSWORD) return process.env.PGPASSWORD;
  const envFile = path.join(os.homedir(), ".chadlewine-backup", "db.env");
  const txt = fs.readFileSync(envFile, "utf8");
  const m = txt.match(/PGPASSWORD\s*=\s*(.+)/);
  if (!m) throw new Error(`PGPASSWORD not found in ${envFile}`);
  return m[1].trim();
}

function stamp() {
  // Local date YYYY-MM-DD (one dump per calendar day; same-day re-runs overwrite).
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const client = new Client({
    host: HOST, port: PORT, user: USER, database: DATABASE,
    password: loadPassword(), ssl: { rejectUnauthorized: false },
    statement_timeout: 0,
  });
  await client.connect();

  // Public base tables, plus auth.users (Supabase-managed accounts).
  const { rows: tbls } = await client.query(
    `select table_name from information_schema.tables
     where table_schema='public' and table_type='BASE TABLE' order by table_name`
  );
  const targets = tbls.map((r) => ({ schema: "public", name: r.table_name }));
  targets.push({ schema: "auth", name: "users" });

  const dump = { meta: { captured_at: new Date().toISOString(), host: HOST, database: DATABASE }, schema: {}, data: {} };
  const counts = {};
  for (const t of targets) {
    const key = t.schema === "public" ? t.name : `${t.schema}.${t.name}`;
    // Column manifest (self-describing schema snapshot).
    const cols = await client.query(
      `select column_name, data_type from information_schema.columns
       where table_schema=$1 and table_name=$2 order by ordinal_position`,
      [t.schema, t.name]
    );
    dump.schema[key] = cols.rows;
    // Lossless data via Postgres json serialization.
    const res = await client.query(
      `select coalesce(json_agg(row_to_json(x)), '[]'::json) as j from "${t.schema}"."${t.name}" x`
    );
    dump.data[key] = res.rows[0].j;
    counts[key] = Array.isArray(dump.data[key]) ? dump.data[key].length : 0;
  }
  await client.end();

  dump.meta.row_counts = counts;
  const outFile = path.join(OUT_DIR, `chadlewine-${stamp()}.json.gz`);
  const gz = zlib.gzipSync(Buffer.from(JSON.stringify(dump)), { level: 9 });
  fs.writeFileSync(outFile, gz);

  const totalRows = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`OK  ${outFile}  (${targets.length} tables, ${totalRows} rows, ${(gz.length / 1024).toFixed(0)} KB)`);

  // Retention: keep the most recent RETAIN daily dumps.
  const files = fs.readdirSync(OUT_DIR)
    .filter((f) => /^chadlewine-\d{4}-\d{2}-\d{2}\.json\.gz$/.test(f))
    .sort();
  const stale = files.slice(0, Math.max(0, files.length - RETAIN));
  for (const f of stale) fs.unlinkSync(path.join(OUT_DIR, f));
  if (stale.length) console.log(`pruned ${stale.length} dump(s) older than the last ${RETAIN}`);
}

main().catch((e) => { console.error("FAIL", e.message); process.exit(1); });
