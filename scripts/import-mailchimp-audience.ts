/* Import a Mailchimp "subscribed_email_audience_export" CSV into the
   chadlewine audience table. Honors existing opt-outs (won't re-subscribe
   rows that previously unsubscribed). Skips admin notification spam.

   Usage:
     npx tsx scripts/import-mailchimp-audience.ts <csv-path>            (dry run)
     npx tsx scripts/import-mailchimp-audience.ts <csv-path> --apply    (write)
*/

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

const envPath = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf-8").split("\n").forEach((line) => {
    const [k, ...rest] = line.split("=");
    if (k && rest.length) process.env[k.trim()] = rest.join("=").trim();
  });
}

const csvPath = process.argv[2];
const apply = process.argv.includes("--apply");
if (!csvPath || !fs.existsSync(csvPath)) {
  console.error("Usage: npx tsx scripts/import-mailchimp-audience.ts <csv-path> [--apply]");
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

// ─── CSV parser ──────────────────────────────────────────────────────
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c === "\r") { /* skip */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.length));
}

// ─── Address parser ──────────────────────────────────────────────────
function parseAddress(raw: string): {
  line1?: string; line2?: string; city?: string; state?: string;
  postal_code?: string; country?: string;
} | null {
  if (!raw || !raw.trim()) return null;
  const parts = raw.split(/\s{2,}/).map((s) => s.trim()).filter(Boolean);
  if (parts.length < 5) return { line1: raw.trim() };
  const country = parts.pop()!;
  const postal_code = parts.pop()!;
  const state = parts.pop()!;
  const city = parts.pop()!;
  const line1 = parts.shift()!;
  const line2 = parts.length ? parts.join(" ") : undefined;
  return { line1, line2, city, state, postal_code, country };
}

// ─── Date parser ─────────────────────────────────────────────────────
function toIso(s: string): string | null {
  if (!s || !s.trim()) return null;
  // Mailchimp format: "2024-05-19 18:45:34" — treat as UTC.
  const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;
}

// ─── Main ────────────────────────────────────────────────────────────
(async () => {
  const text = fs.readFileSync(csvPath, "utf-8");
  const rows = parseCsv(text);
  const header = rows.shift();
  if (!header) { console.error("Empty CSV"); process.exit(1); }
  const col = (name: string) => header.indexOf(name);
  const iEmail = col("Email Address");
  const iFirst = col("First Name");
  const iLast = col("Last Name");
  const iAddr = col("Address");
  const iOptin = col("OPTIN_TIME");
  const iConfirm = col("CONFIRM_TIME");

  console.log(`Parsed ${rows.length} contacts from ${csvPath}`);
  console.log(`Mode: ${apply ? "APPLY (writing to prod)" : "DRY RUN"}\n`);

  let inserted = 0, updated = 0, skippedUnsub = 0, errors = 0;
  const now = new Date().toISOString();

  for (const r of rows) {
    const email = (r[iEmail] || "").trim().toLowerCase();
    if (!email || !email.includes("@")) { errors++; continue; }
    const firstName = (r[iFirst] || "").trim() || null;
    const lastName = (r[iLast] || "").trim() || null;
    const displayName = [firstName, lastName].filter(Boolean).join(" ") || null;
    const addr = parseAddress(r[iAddr] || "");
    const optInAt = toIso(r[iConfirm]) || toIso(r[iOptin]) || now;
    const firstSeenAt = toIso(r[iOptin]) || optInAt;

    const { data: existing } = await supabase
      .from("audience")
      .select("id, subscriber_status, first_name, last_name, display_name, mailing_line1")
      .eq("email", email)
      .maybeSingle();

    if (existing) {
      // Honor prior opt-out — do not flip back to active.
      if (existing.subscriber_status === "unsubscribed") {
        skippedUnsub++;
        console.log(`SKIP (unsubscribed): ${email}`);
        continue;
      }
      const patch: Record<string, unknown> = { updated_at: now };
      if (existing.subscriber_status !== "active") {
        patch.subscriber_status = "active";
        patch.marketing_opt_in_at = optInAt;
        patch.marketing_opt_in_source = "mailchimp_import";
      }
      if (firstName && !existing.first_name) patch.first_name = firstName;
      if (lastName && !existing.last_name) patch.last_name = lastName;
      if (displayName && !existing.display_name) patch.display_name = displayName;
      if (addr && !existing.mailing_line1) {
        patch.mailing_line1 = addr.line1 ?? null;
        patch.mailing_line2 = addr.line2 ?? null;
        patch.mailing_city = addr.city ?? null;
        patch.mailing_state = addr.state ?? null;
        patch.mailing_postal_code = addr.postal_code ?? null;
        patch.mailing_country = addr.country ?? null;
      }
      if (Object.keys(patch).length === 1) {
        console.log(`NOOP: ${email}`);
        continue;
      }
      updated++;
      console.log(`UPDATE: ${email} ${Object.keys(patch).filter(k=>k!=="updated_at").join(",")}`);
      if (apply) {
        const { error } = await supabase.from("audience").update(patch).eq("id", existing.id);
        if (error) { console.error(`  ! ${error.message}`); errors++; continue; }
        await supabase.rpc("upsert_audience_event", {
          p_audience_id: existing.id,
          p_event_type: "subscribed",
          p_metadata: { source: "mailchimp_import" },
        });
        await supabase.rpc("refresh_audience_tags", { p_audience_id: existing.id });
      }
    } else {
      inserted++;
      console.log(`INSERT: ${email}${displayName ? ` (${displayName})` : ""}${addr ? " [addr]" : ""}`);
      if (apply) {
        const insertRow: Record<string, unknown> = {
          email,
          first_name: firstName,
          last_name: lastName,
          display_name: displayName,
          subscriber_status: "active",
          marketing_opt_in_at: optInAt,
          marketing_opt_in_source: "mailchimp_import",
          first_seen_at: firstSeenAt,
        };
        if (addr) {
          insertRow.mailing_line1 = addr.line1 ?? null;
          insertRow.mailing_line2 = addr.line2 ?? null;
          insertRow.mailing_city = addr.city ?? null;
          insertRow.mailing_state = addr.state ?? null;
          insertRow.mailing_postal_code = addr.postal_code ?? null;
          insertRow.mailing_country = addr.country ?? null;
        }
        const { data: ins, error } = await supabase
          .from("audience").insert(insertRow).select("id").single();
        if (error || !ins) { console.error(`  ! ${error?.message}`); errors++; continue; }
        await supabase.rpc("upsert_audience_event", {
          p_audience_id: ins.id,
          p_event_type: "subscribed",
          p_metadata: { source: "mailchimp_import" },
        });
        await supabase.rpc("refresh_audience_tags", { p_audience_id: ins.id });
      }
    }
  }

  console.log(`\n── Summary ──`);
  console.log(`  Inserted: ${inserted}`);
  console.log(`  Updated:  ${updated}`);
  console.log(`  Skipped (already unsubscribed): ${skippedUnsub}`);
  console.log(`  Errors:   ${errors}`);
  if (!apply) console.log(`\n(dry run — re-run with --apply to write)`);
})();
