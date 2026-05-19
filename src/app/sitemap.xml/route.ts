import {
  SUB_SITEMAPS,
  computeMaxLastmod,
  renderSitemapIndex,
  httpDate,
} from "@/lib/sitemap-config";

export const dynamic = "force-dynamic";

export async function GET() {
  const subs = await Promise.all(
    SUB_SITEMAPS.map(async (s) => {
      const entries = await s.fetch();
      const lastmod = computeMaxLastmod(entries) ?? new Date().toISOString();
      return { filename: s.filename, lastmod };
    }),
  );

  const indexLastmod = subs.reduce(
    (max, s) => (s.lastmod > max ? s.lastmod : max),
    subs[0]?.lastmod ?? new Date().toISOString(),
  );

  return new Response(renderSitemapIndex(subs), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600",
      "Last-Modified": httpDate(indexLastmod),
    },
  });
}
