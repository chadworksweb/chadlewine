import { createAdminClient } from "@/lib/supabase-server";
import { resolveSkuDownloadPaths } from "@/lib/release-skus";
import { sendEmail, buildPreorderReadyHtml } from "@/lib/email";
import { DOWNLOAD_FORMATS, type DownloadFormat } from "@/lib/audio-formats";

// Manual "Deliver Preorder" push. Decoupled from album publish/release status:
// this ONLY notifies the people who preordered + opens the SKU for sale. It
// does not touch releases.status.
//
// Flow:
//   1. Guard: the release's digital SKU must have download files uploaded,
//      otherwise the emails would carry no links.
//   2. Email every preorder buyer (any SKU of this release) their download
//      links -- physical SKUs resolve to the sibling digital copy.
//   3. Mark those purchases fulfilled so a re-run never double-emails.
//   4. Flip every 'preorder' SKU (and variant) of this release to 'available'
//      so new buyers get instant downloads too.

const SITE_URL = process.env.SITE_URL || "https://chadlewine.com";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FORMATS = DOWNLOAD_FORMATS;
type FormatKey = DownloadFormat;
// Spelled out: supabase-js parses the select string at the type level, so a
// computed column list degrades every row to a ParserError.
const DL_COLUMNS =
  "download_path_mp3, download_path_flac, download_path_wav, download_path_aac";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: idOrSlug } = await params;
  const supabase = createAdminClient();

  // Resolve slug or uuid to the release id.
  let releaseId = UUID_RE.test(idOrSlug) ? idOrSlug : null;
  if (!releaseId) {
    const { data } = await supabase
      .from("releases")
      .select("id")
      .eq("slug", idOrSlug)
      .maybeSingle();
    releaseId = data?.id ?? null;
  }
  if (!releaseId) {
    return Response.json({ error: "Release not found" }, { status: 404 });
  }

  const { data: release } = await supabase
    .from("releases")
    .select("id, title, cover_art_path")
    .eq("id", releaseId)
    .single();
  if (!release) {
    return Response.json({ error: "Release not found" }, { status: 404 });
  }

  // All SKUs for this release, plus the digital one for the files guard.
  const { data: skuRows } = await supabase
    .from("release_skus")
    .select(`id, format, status, ${DL_COLUMNS}`)
    .eq("release_id", releaseId);
  const skus = skuRows || [];
  if (skus.length === 0) {
    return Response.json({ error: "This release has no SKUs." }, { status: 400 });
  }

  const digital = skus.find((s) => s.format === "digital");
  const digitalRow = digital as Record<string, unknown> | undefined;
  const digitalHasFiles =
    !!digitalRow && FORMATS.some((f) => !!digitalRow[`download_path_${f}`]);
  if (!digitalHasFiles) {
    return Response.json(
      {
        error:
          "Upload the album's digital download files first. The digital SKU has no download path on any format, so preorder emails would have nothing to download.",
      },
      { status: 400 },
    );
  }

  const skuIds = skus.map((s) => s.id);

  // Unfulfilled preorder purchases across every SKU of this release.
  const { data: purchaseRows } = await supabase
    .from("purchases")
    .select("id, buyer_email, release_sku_id, preorder_fulfilled_at")
    .eq("item_type", "release")
    .in("release_sku_id", skuIds)
    .is("preorder_fulfilled_at", null);
  const purchases = purchaseRows || [];

  // Effective download paths per SKU (physical -> sibling digital copy).
  const { byReleaseSku } = await resolveSkuDownloadPaths(supabase, skuIds, []);
  const recoverUrl = `${SITE_URL}/music/recover`;

  let emailed = 0;
  let skipped = 0;
  let failed = 0;
  const fulfilledIds: string[] = [];

  for (const p of purchases) {
    const email = p.buyer_email;
    const paths = p.release_sku_id ? byReleaseSku.get(p.release_sku_id) : undefined;
    const formatLinks = paths
      ? FORMATS.filter((f) => paths[f]).map((f: FormatKey) => ({
          format: f,
          url: `${SITE_URL}/api/download/${p.id}?format=${f}`,
        }))
      : [];

    if (!email || email === "unknown" || formatLinks.length === 0) {
      skipped++;
      continue;
    }

    const html = buildPreorderReadyHtml({
      buyerName: null,
      albumTitle: release.title,
      coverUrl: release.cover_art_path,
      formatLinks,
      recoverUrl,
    });

    const sent = await sendEmail({
      to: email,
      subject: `${release.title} is out - your preorder is ready`,
      html,
      replyTo: process.env.ADMIN_NOTIFY_EMAIL || "portal@chadlewine.com",
    });

    if (sent) {
      emailed++;
      fulfilledIds.push(p.id);
    } else {
      failed++;
    }
  }

  // Mark the ones we actually delivered so a re-run only retries failures.
  if (fulfilledIds.length > 0) {
    await supabase
      .from("purchases")
      .update({ preorder_fulfilled_at: new Date().toISOString() })
      .in("id", fulfilledIds);
  }

  // Open the SKUs (and their variants) for sale: preorder -> available.
  const preorderSkuIds = skus.filter((s) => s.status === "preorder").map((s) => s.id);
  let openedSkus = 0;
  if (preorderSkuIds.length > 0) {
    const { data: opened } = await supabase
      .from("release_skus")
      .update({ status: "available" })
      .in("id", preorderSkuIds)
      .select("id");
    openedSkus = opened?.length ?? 0;

    await supabase
      .from("sku_variants")
      .update({ status: "available" })
      .in("release_sku_id", preorderSkuIds)
      .eq("status", "preorder");
  }

  return Response.json({
    total: purchases.length,
    emailed,
    skipped,
    failed,
    opened_skus: openedSkus,
  });
}
