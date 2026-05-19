// Send a test fan-ode email to an arbitrary address.
//
//   npx tsx scripts/send-fan-ode-test.ts <email> [firstName]
//   npx tsx scripts/send-fan-ode-test.ts chad@chadworks.co
//   npx tsx scripts/send-fan-ode-test.ts chad@chadworks.co Chad
//
// Generates a fake token and sends through Resend using the same block
// renderer the cron uses. Does NOT write the token to any audience row
// -- purely an email preview in your real inbox.

import { randomBytes } from "crypto";
import * as fs from "fs";
import * as path from "path";
import { sendEmail } from "../src/lib/email";
import { renderEmail, type EmailBlock, type GlobalsRow, type TemplateRow } from "../src/lib/email-blocks";
import { createClient } from "@supabase/supabase-js";

const envPath = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf-8").split("\n").forEach((line) => {
    const [k, ...rest] = line.split("=");
    if (k && rest.length) process.env[k.trim()] = rest.join("=").trim();
  });
}

(async () => {
  const to = process.argv[2];
  const firstName = process.argv[3] ?? null;
  if (!to) {
    console.error("Usage: npx tsx scripts/send-fan-ode-test.ts <email> [firstName]");
    process.exit(1);
  }

  if (!process.env.RESEND_API_KEY) {
    console.error("RESEND_API_KEY is not set in .env.local — cannot send.");
    process.exit(1);
  }

  // Standalone supabase client — the @/lib/supabase-server import chain
  // pulls in Next.js cookies(), which doesn't work in a node script.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const [{ data: tpl }, { data: g }] = await Promise.all([
    supabase.from("email_templates").select("*").eq("slug", "fan-ode").maybeSingle(),
    supabase.from("email_globals").select("*").eq("id", 1).maybeSingle(),
  ]);

  if (!tpl) {
    console.error("fan-ode template not found. Apply the 20260516140000 migration first.");
    process.exit(1);
  }

  const globals: GlobalsRow = {
    header_blocks: ((g?.header_blocks as EmailBlock[]) || []),
    footer_blocks: ((g?.footer_blocks as EmailBlock[]) || []),
  };

  const token = randomBytes(16).toString("hex");
  const rendered = renderEmail(tpl as TemplateRow, globals, {
    first_name: firstName,
    token,
  });
  const ok = await sendEmail({
    to,
    subject: `[TEST] ${rendered.subject}`,
    html: rendered.html,
  });

  if (ok) {
    console.log(`Sent to ${to}.`);
    console.log(`Token used: ${token}`);
    console.log(`Preview link: http://localhost:8888/fan-song?token=${token}`);
    console.log("(The link won't resolve unless you also paste this token onto an audience row's fan_ode_token.)");
  } else {
    console.error("Send failed. Check RESEND_API_KEY + EMAIL_FROM env vars.");
    process.exit(1);
  }
})();
