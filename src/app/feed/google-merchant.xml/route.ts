import { createPublicClient } from "@/lib/supabase-server";

// Google Merchant Center product feed (RSS 2.0 + g: namespace).
// Submitted to Merchant Center as a scheduled-fetch primary feed; this is what
// powers Shopping free listings and ads (on-page Product JSON-LD alone only
// yields limited free listings). One item per product, lowest sellable price.
//
// Shipping is intentionally omitted here -- rates are Printify-quoted and vary,
// so they live in Merchant Center account-level shipping services, not the feed.
// Returns mirror the on-page policy (all sales final) via account settings.

export const dynamic = "force-dynamic";

const SITE = "https://chadlewine.com";
const CURRENCY = "USD";
const BRAND = "Chad Lewine";

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Strip HTML/markdown noise to plain text for g:description (max 5000 chars).
function plain(s: string | null | undefined): string {
  return (s || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 5000);
}

function money(n: number): string {
  return `${(Math.round(n * 100) / 100).toFixed(2)} ${CURRENCY}`;
}

function absImage(url: string | null): string | null {
  if (!url) return null;
  return /^https?:\/\//.test(url) ? url : `${SITE}${url.startsWith("/") ? "" : "/"}${url}`;
}

interface FeedItem {
  id: string;
  title: string;
  description: string;
  link: string;
  image: string;
  price: number;
  available: boolean;
  mpn: string;
  // Set for apparel variants so Google groups them as one product and matches
  // on size/color.
  itemGroupId?: string;
  size?: string | null;
  color?: string | null;
}

function renderItem(it: FeedItem): string {
  const lines = [
    "    <item>",
    `      <g:id>${xmlEscape(it.id)}</g:id>`,
    `      <g:title>${xmlEscape(it.title.slice(0, 150))}</g:title>`,
    `      <g:description>${xmlEscape(it.description)}</g:description>`,
    `      <g:link>${xmlEscape(it.link)}</g:link>`,
    `      <g:image_link>${xmlEscape(it.image)}</g:image_link>`,
    `      <g:availability>${it.available ? "in_stock" : "out_of_stock"}</g:availability>`,
    `      <g:price>${money(it.price)}</g:price>`,
    `      <g:brand>${xmlEscape(BRAND)}</g:brand>`,
    "      <g:condition>new</g:condition>",
    "      <g:identifier_exists>no</g:identifier_exists>",
    `      <g:mpn>${xmlEscape(it.mpn)}</g:mpn>`,
  ];
  if (it.itemGroupId) lines.push(`      <g:item_group_id>${xmlEscape(it.itemGroupId)}</g:item_group_id>`);
  if (it.size) lines.push(`      <g:size>${xmlEscape(it.size)}</g:size>`);
  if (it.color) lines.push(`      <g:color>${xmlEscape(it.color)}</g:color>`);
  lines.push("    </item>");
  return lines.join("\n");
}

interface MerchRow {
  id: string;
  slug: string | null;
  title: string;
  image_url: string | null;
  description: string | null;
  seo_description: string | null;
  price: number | string | null;
  variants: MerchVariant[] | null;
}

interface MerchVariant {
  id?: number | string;
  title?: string | null;
  size?: string | null;
  color?: string | null;
  price_cents?: number;
}

interface ArtPieceRow {
  id: string;
  slug: string | null;
  title: string;
  image_path: string | null;
  description: string | null;
  seo_description: string | null;
  citation_summary: string | null;
  art_summary: string | null;
}

interface ArtSkuRow {
  art_id: string;
  sale_mode: string;
  price: number | string | null;
  edition_size: number | null;
  editions_sold: number | null;
}

// Lowest sellable price for a merch product: explicit row price, else the
// cheapest positive variant price. Returns null when nothing is sellable.
function merchPrice(row: MerchRow): number | null {
  const base = row.price == null ? null : Number(row.price);
  if (base != null && base > 0) return base;
  const variantPrices = (row.variants || [])
    .map((v) => (typeof v.price_cents === "number" ? v.price_cents / 100 : null))
    .filter((n): n is number => n != null && n > 0);
  return variantPrices.length > 0 ? Math.min(...variantPrices) : null;
}

export async function GET() {
  const supabase = createPublicClient();

  const [merchRes, artRes] = await Promise.all([
    supabase
      .from("merch")
      .select("id, slug, title, image_url, description, seo_description, price, variants")
      .in("fulfillment", ["manual", "printify_curated"])
      .eq("status", "active"),
    supabase
      .from("art_pieces")
      .select("id, slug, title, image_path, description, seo_description, citation_summary, art_summary")
      .eq("status", "published"),
  ]);

  const items: FeedItem[] = [];

  // --- Merch ---
  // One feed item per purchasable variant (size/color), grouped under the
  // product via item_group_id. Products with no priced variants fall back to a
  // single item using the row price. Printify goods are print-on-demand, so
  // availability is in_stock.
  for (const row of (merchRes.data as MerchRow[] | null) || []) {
    if (!row.slug) continue;
    const image = absImage(row.image_url);
    if (!image) continue;
    const link = `${SITE}/merch/${row.slug}`;
    const desc = plain(row.seo_description || row.description) || `${row.title}, official merch from ${BRAND}.`;

    const pricedVariants = (row.variants || []).filter(
      (v) => typeof v.price_cents === "number" && v.price_cents > 0,
    );

    if (pricedVariants.length > 0) {
      const groupId = `merch-${row.id}`;
      for (const v of pricedVariants) {
        const label = [v.color, v.size].filter(Boolean).join(" / ") || v.title || "";
        items.push({
          id: `${groupId}-v${v.id}`,
          title: label ? `${row.title} - ${label}` : row.title,
          description: desc,
          link,
          image,
          price: (v.price_cents as number) / 100,
          available: true,
          mpn: `${row.id}-${v.id}`,
          itemGroupId: groupId,
          size: v.size ?? null,
          color: v.color ?? null,
        });
      }
      continue;
    }

    const price = merchPrice(row);
    if (price == null) continue;
    items.push({
      id: `merch-${row.id}`,
      title: row.title,
      description: desc,
      link,
      image,
      price,
      available: true,
      mpn: row.id,
    });
  }

  // --- Art (buy_now SKUs only, priced, editions remaining) ---
  const artPieces = (artRes.data as ArtPieceRow[] | null) || [];
  if (artPieces.length > 0) {
    const { data: skuData } = await supabase
      .from("art_skus")
      .select("art_id, sale_mode, price, edition_size, editions_sold")
      .in(
        "art_id",
        artPieces.map((a) => a.id),
      )
      .eq("sale_mode", "buy_now");

    const byArt = new Map<string, { price: number; available: boolean }>();
    for (const sku of (skuData as ArtSkuRow[] | null) || []) {
      const price = sku.price == null ? null : Number(sku.price);
      if (price == null || price <= 0) continue;
      const size = sku.edition_size ?? 0;
      const sold = sku.editions_sold ?? 0;
      const available = size <= 0 || sold < size;
      const prev = byArt.get(sku.art_id);
      if (!prev || price < prev.price) {
        byArt.set(sku.art_id, { price, available: available || (prev?.available ?? false) });
      } else if (available) {
        prev.available = true;
      }
    }

    for (const art of artPieces) {
      if (!art.slug) continue;
      const sellable = byArt.get(art.id);
      const image = absImage(art.image_path);
      if (!sellable || !image) continue;
      const desc =
        plain(art.seo_description || art.citation_summary || art.art_summary || art.description) ||
        `${art.title}, original art by ${BRAND}.`;
      items.push({
        id: `art-${art.id}`,
        title: art.title,
        description: desc,
        link: `${SITE}/art/${art.slug}`,
        image,
        price: sellable.price,
        available: sellable.available,
        mpn: art.id,
      });
    }
  }

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
    "  <channel>",
    `    <title>${xmlEscape(BRAND)}</title>`,
    `    <link>${SITE}</link>`,
    "    <description>Merch and art by Chad Lewine</description>",
    ...items.map(renderItem),
    "  </channel>",
    "</rss>",
  ].join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
