/* One-shot import of the Supabase auth users into a Clerk instance.
   Part of the 2026-08 Supabase -> DO Postgres migration.

   Usage:
     CLERK_SECRET_KEY=sk_... node scripts/import-users-clerk.mjs path/to/auth-users.csv

   Reads the CSV exported from Supabase (id,email,encrypted_password,...) and
   creates each user with its bcrypt hash intact, so passwords keep working.
   The old Supabase UUID is stored as Clerk external_id, which is how audience
   and admins rows are re-linked. Safe to re-run: existing emails are skipped.
   Run once against the dev instance for testing, again at prod cutover. */

import { readFileSync } from "node:fs";

const key = process.env.CLERK_SECRET_KEY;
const csvPath = process.argv[2];
if (!key || !csvPath) {
  console.error("usage: CLERK_SECRET_KEY=sk_... node scripts/import-users-clerk.mjs auth-users.csv");
  process.exit(1);
}

const api = async (path, init = {}) => {
  const res = await fetch(`https://api.clerk.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
};

/* Minimal CSV parse: fields never contain commas except the JSON metadata
   column, which is quoted. Handles quoted fields with embedded commas. */
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (field !== "" || row.length) { row.push(field); rows.push(row); row = []; field = ""; }
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const [header, ...rows] = parseCsv(readFileSync(csvPath, "utf8"));
const col = (name) => header.indexOf(name);

let created = 0, skipped = 0, failed = 0;
for (const r of rows) {
  const email = r[col("email")];
  const hash = r[col("encrypted_password")];
  const supabaseId = r[col("id")];
  if (!email) continue;

  const existing = await api(`/users?email_address=${encodeURIComponent(email)}`);
  if (Array.isArray(existing.body) && existing.body.length > 0) {
    console.log(`skip   ${email} (already exists as ${existing.body[0].id})`);
    skipped++;
    continue;
  }

  const { status, body } = await api("/users", {
    method: "POST",
    body: JSON.stringify({
      email_address: [email],
      password_digest: hash,
      password_hasher: "bcrypt",
      external_id: supabaseId,
      skip_password_checks: true,
    }),
  });

  if (status === 200 || status === 201) {
    // Supabase only let confirmed users log in, so imports arrive verified;
    // otherwise the login route would bounce them to "confirm your email".
    const primaryId = body.primary_email_address_id || body.email_addresses?.[0]?.id;
    if (primaryId) {
      const v = await api(`/email_addresses/${primaryId}`, {
        method: "PATCH",
        body: JSON.stringify({ verified: true }),
      });
      if (v.status !== 200) console.log(`  warn: could not mark ${email} verified (${v.status})`);
    }
    console.log(`create ${email} -> ${body.id}`);
    created++;
  } else {
    console.log(`FAIL   ${email}: ${status} ${JSON.stringify(body.errors || body).slice(0, 200)}`);
    failed++;
  }
}
console.log(`done: ${created} created, ${skipped} skipped, ${failed} failed`);
process.exit(failed ? 1 : 0);
