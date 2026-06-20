/**
 * _test-welcome-email.ts
 * Sends the real welcome-01 email to a test address, through the same renderer
 * and send path a new subscriber hits (incl. the front-desk reply_to).
 *
 * Usage: npx tsx scripts/_test-welcome-email.ts [to-address]
 */

import * as fs from "fs";
import * as path from "path";
import { renderTemplateBySlug } from "../src/lib/email-blocks";
import { sendEmail } from "../src/lib/email";

const envPath = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const [key, ...rest] = line.split("=");
    if (key && rest.length > 0) process.env[key.trim()] = rest.join("=").trim();
  }
}

const to = process.argv[2] || "chad@chadworks.co";
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://chadlewine.com";

async function main() {
  const rendered = await renderTemplateBySlug("welcome-01", {
    first_name: "Chad",
    // Placeholders so the footer's unsubscribe + preferences links render.
    unsubscribe_url: `${siteUrl}/unsubscribe?token=TEST`,
    preferences_url: `${siteUrl}/preferences?token=TEST`,
  });
  if (!rendered) {
    console.error("template welcome-01 not found");
    process.exit(1);
  }

  const ok = await sendEmail({
    to,
    subject: rendered.subject,
    html: rendered.html,
    replyTo: process.env.EMAIL_REPLY_TO || undefined,
  });

  console.log(ok ? `sent welcome-01 to ${to}` : `send FAILED to ${to}`);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
