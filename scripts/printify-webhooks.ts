/**
 * printify-webhooks.ts
 *
 * Manage Printify webhook subscriptions for chadlewine.com. Printify has no
 * dashboard UI for webhooks — they exist only via the REST API.
 *
 * Usage:
 *   npx tsx scripts/printify-webhooks.ts list                  # show current subs
 *   npx tsx scripts/printify-webhooks.ts ensure                # dry-run sync
 *   npx tsx scripts/printify-webhooks.ts ensure --apply        # add missing subs
 *   npx tsx scripts/printify-webhooks.ts delete <webhook_id>   # remove one
 *
 * Env:
 *   PRINTIFY_API_TOKEN, PRINTIFY_SHOP_ID
 *   PRINTIFY_WEBHOOK_URL  (defaults to https://chadlewine.com/api/webhooks/printify)
 *   PRINTIFY_WEBHOOK_SECRET (used as the HMAC secret on new subscriptions)
 */

import * as fs from "fs";
import * as path from "path";

const envPath = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf-8")
    .split("\n")
    .forEach((line) => {
      const [k, ...rest] = line.split("=");
      if (k && rest.length > 0) process.env[k.trim()] = rest.join("=").trim();
    });
}

const PRINTIFY_API = "https://api.printify.com/v1";
const TOKEN = process.env.PRINTIFY_API_TOKEN;
const SHOP_ID = process.env.PRINTIFY_SHOP_ID;
const WEBHOOK_URL = process.env.PRINTIFY_WEBHOOK_URL || "https://chadlewine.com/api/webhooks/printify";
const WEBHOOK_SECRET = process.env.PRINTIFY_WEBHOOK_SECRET || "";

if (!TOKEN || !SHOP_ID) {
  console.error("Missing PRINTIFY_API_TOKEN or PRINTIFY_SHOP_ID in .env.local");
  process.exit(1);
}

// Topics our webhook route at /api/webhooks/printify actually handles.
const REQUIRED_TOPICS = [
  "product:publish:started",
  "order:created",
  "order:updated",
  "order:sent-to-production",
  "order:shipment:created",
  "order:shipment:delivered",
];

function pfHeaders() {
  return {
    Authorization: `Bearer ${TOKEN}`,
    "Content-Type": "application/json",
  };
}

interface Webhook {
  id: string;
  topic: string;
  url: string;
  shop_id: number;
}

async function list(): Promise<Webhook[]> {
  const res = await fetch(`${PRINTIFY_API}/shops/${SHOP_ID}/webhooks.json`, { headers: pfHeaders() });
  if (!res.ok) throw new Error(`list webhooks → ${res.status} ${await res.text()}`);
  return res.json();
}

async function create(topic: string): Promise<Webhook> {
  const body: Record<string, unknown> = { topic, url: WEBHOOK_URL };
  if (WEBHOOK_SECRET) body.secret = WEBHOOK_SECRET;
  const res = await fetch(`${PRINTIFY_API}/shops/${SHOP_ID}/webhooks.json`, {
    method: "POST",
    headers: pfHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`create ${topic} → ${res.status} ${await res.text()}`);
  return res.json();
}

async function remove(id: string) {
  const res = await fetch(`${PRINTIFY_API}/shops/${SHOP_ID}/webhooks/${id}.json`, {
    method: "DELETE",
    headers: pfHeaders(),
  });
  if (!res.ok) throw new Error(`delete ${id} → ${res.status} ${await res.text()}`);
}

async function main() {
  const cmd = process.argv[2];
  const apply = process.argv.includes("--apply");

  if (cmd === "list") {
    const hooks = await list();
    if (hooks.length === 0) {
      console.log("(no webhooks subscribed)");
      return;
    }
    for (const h of hooks) console.log(`${h.id}  ${h.topic.padEnd(32)}  ${h.url}`);
    return;
  }

  if (cmd === "delete") {
    const id = process.argv[3];
    if (!id) {
      console.error("Usage: printify-webhooks.ts delete <webhook_id>");
      process.exit(1);
    }
    await remove(id);
    console.log(`deleted ${id}`);
    return;
  }

  if (cmd === "ensure") {
    if (!WEBHOOK_SECRET) {
      console.warn("⚠  PRINTIFY_WEBHOOK_SECRET not set — new subs will be created without HMAC.");
      console.warn("   Set it in .env.local first, otherwise the prod webhook will accept unsigned events.");
    }
    const hooks = await list();
    console.log(`Currently subscribed: ${hooks.length}`);
    for (const h of hooks) console.log(`  ${h.topic.padEnd(32)} → ${h.url}`);

    const haveAtUrl = new Set(hooks.filter((h) => h.url === WEBHOOK_URL).map((h) => h.topic));
    const missing = REQUIRED_TOPICS.filter((t) => !haveAtUrl.has(t));
    const wrongUrl = hooks.filter((h) => REQUIRED_TOPICS.includes(h.topic) && h.url !== WEBHOOK_URL);

    if (wrongUrl.length) {
      console.log(`\n⚠  ${wrongUrl.length} required topic(s) point to a different URL:`);
      for (const h of wrongUrl) console.log(`  ${h.id}  ${h.topic}  → ${h.url}`);
      console.log(`  (delete with: npx tsx scripts/printify-webhooks.ts delete <id>)`);
    }

    if (missing.length === 0) {
      console.log(`\nAll ${REQUIRED_TOPICS.length} required topics already subscribed at ${WEBHOOK_URL}. Nothing to do.`);
      return;
    }

    console.log(`\nMissing ${missing.length} topic(s) at ${WEBHOOK_URL}:`);
    for (const t of missing) console.log(`  + ${t}`);

    if (!apply) {
      console.log(`\nDry run only. Re-run with --apply to create.`);
      return;
    }

    for (const t of missing) {
      try {
        const w = await create(t);
        console.log(`created  ${w.id}  ${t}`);
      } catch (e) {
        console.error(`FAIL     ${t}  →  ${(e as Error).message}`);
      }
    }
    return;
  }

  console.error("Usage: printify-webhooks.ts <list|ensure [--apply]|delete <id>>");
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
