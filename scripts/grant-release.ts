/**
 * Comp a release to someone: writes a completed manual order plus its purchase
 * row, then emails the buyer their download links.
 *
 * This is the manual counterpart to a Stripe purchase. It creates the same rows
 * the webhook would, so every downstream surface works the same way: the
 * account downloads page, the recovery flow, and the per-format signed links
 * from /api/download/{purchaseId}.
 *
 * It deliberately does NOT touch the SKU's status. Flipping a preorder SKU to
 * available is the launch, and that is a separate decision from comping one
 * person a copy.
 *
 * Usage:
 *   npx tsx scripts/grant-release.ts --slug dont-blame-me --email someone@example.com --dry-run
 *   npx tsx scripts/grant-release.ts --slug dont-blame-me --email someone@example.com --name "Chad"
 *   npx tsx scripts/grant-release.ts --slug dont-blame-me --email someone@example.com --amount 10
 *
 * Default amount is 0, which is what a comp should record. Pass --amount to log
 * it as a paid order instead.
 */
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import { sendEmail, buildPreorderReadyHtml } from "../src/lib/email";
import { DOWNLOAD_FORMATS, type DownloadFormat } from "../src/lib/audio-formats";

loadEnv({ path: ".env.local", quiet: true });

// Links must point at production regardless of the local SITE_URL.
const PUBLIC_ORIGIN = process.env.PUBLIC_ORIGIN || "https://chadlewine.com";

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function requireEnv(k: string): string {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env: ${k}`);
  return v;
}

async function main() {
  const slug = arg("slug");
  const email = (arg("email") || "").trim().toLowerCase();
  if (!slug || !email) {
    console.error(
      "Usage: npx tsx scripts/grant-release.ts --slug <release-slug> --email <address> [--name X] [--amount 0] [--dry-run]",
    );
    process.exit(1);
  }
  const dryRun = flag("dry-run");
  const buyerName = arg("name");
  const amount = Number(arg("amount") ?? 0);

  const supabase = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  );

  const { data: release, error: relErr } = await supabase
    .from("releases")
    .select("id, title, slug, cover_art_path")
    .eq("slug", slug)
    .single();
  if (relErr || !release) throw new Error(`No release with slug ${slug}`);

  const { data: sku } = await supabase
    .from("release_skus")
    .select("id, status, download_path_mp3, download_path_flac, download_path_wav, download_path_aac")
    .eq("release_id", release.id)
    .eq("format", "digital")
    .single();
  if (!sku) throw new Error(`${slug} has no digital SKU`);

  const skuRow = sku as unknown as Record<string, string | null>;
  const available = DOWNLOAD_FORMATS.filter((f) => skuRow[`download_path_${f}`]);
  if (available.length === 0) {
    throw new Error(`${slug}'s digital SKU has no download paths; nothing to grant`);
  }

  // Audience row: the buyer identity every downstream surface keys on.
  const { data: existingAudience } = await supabase
    .from("audience")
    .select("id, email, display_name")
    .eq("email", email)
    .maybeSingle();

  const { data: lastOrder } = await supabase
    .from("orders")
    .select("order_number")
    .like("order_number", "CL-%")
    .order("order_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  const lastNum = parseInt(String(lastOrder?.order_number || "CL-1000").replace("CL-", ""), 10);
  const orderNumber = `CL-${lastNum + 1}`;

  console.log(`Release  : ${release.title} (${slug})`);
  console.log(`SKU      : ${sku.id} [${sku.status}]  formats: ${available.join(", ")}`);
  console.log(`Buyer    : ${email}${buyerName ? ` (${buyerName})` : ""}`);
  console.log(`Audience : ${existingAudience ? `existing ${existingAudience.id}` : "will be created"}`);
  console.log(`Order    : ${orderNumber}  total ${amount}`);
  if (dryRun) {
    console.log("\n--dry-run: no rows written, no email sent.");
    return;
  }

  let audienceId = existingAudience?.id as string | undefined;
  if (!audienceId) {
    const { data: created, error } = await supabase
      .from("audience")
      .insert({
        email,
        display_name: buyerName || null,
        subscriber_status: "subscribed",
        first_seen_at: new Date().toISOString(),
        notes: `Created by a manual release grant (${slug}).`,
      })
      .select("id")
      .single();
    if (error) throw new Error(`audience insert: ${error.message}`);
    audienceId = created.id as string;
  }

  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .insert({
      order_number: orderNumber,
      status: "completed",
      buyer_email: email,
      buyer_name: buyerName || null,
      subtotal: amount,
      shipping: 0,
      tax: 0,
      total: amount,
      has_digital_lines: true,
      has_printify_lines: false,
      has_manual_physical_lines: false,
      audience_id: audienceId,
      notes: `Manual grant of ${release.title}. No payment processed.`,
    })
    .select("id, order_number")
    .single();
  if (orderErr) throw new Error(`order insert: ${orderErr.message}`);

  const { data: purchase, error: purErr } = await supabase
    .from("purchases")
    .insert({
      buyer_email: email,
      item_type: "release",
      item_id: release.id,
      release_sku_id: sku.id,
      order_id: order.id,
      audience_id: audienceId,
      quantity: 1,
      unit_price: amount,
      line_total: amount,
      amount,
      // Null format means "every format this SKU offers", which is what the
      // account page and the download route both key on.
      format: null,
      title_snapshot: release.title,
      // Stamped now: a later Deliver Preorder run must not email this buyer twice.
      preorder_fulfilled_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (purErr) throw new Error(`purchase insert: ${purErr.message}`);

  const formatLinks = available.map((f: DownloadFormat) => ({
    format: f,
    url: `${PUBLIC_ORIGIN}/api/download/${purchase.id}?format=${f}`,
  }));

  const html = buildPreorderReadyHtml({
    buyerName: buyerName || null,
    albumTitle: release.title as string,
    coverUrl: release.cover_art_path as string | null,
    formatLinks,
    recoverUrl: `${PUBLIC_ORIGIN}/music/recover`,
  });

  const sent = await sendEmail({
    to: email,
    subject: `${release.title} is yours`,
    html,
  });

  console.log(`\norder    ${order.order_number}  ${order.id}`);
  console.log(`purchase ${purchase.id}`);
  for (const l of formatLinks) console.log(`  ${l.format.padEnd(4)} ${l.url}`);
  console.log(`email    ${sent ? "sent" : "FAILED"} to ${email}`);
  console.log("SKU status untouched.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
