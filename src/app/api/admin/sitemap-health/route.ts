import { SUB_SITEMAPS } from "@/lib/sitemap-config";
import { publicOrigin } from "@/lib/request-origin";

export const dynamic = "force-dynamic";

interface SubSitemapHealth {
  id: string;
  label: string;
  filename: string;
  url: string;
  status: "ok" | "error" | "missing";
  url_count: number;
  expected_count: number;
  mismatch: boolean;
  error: string | null;
  last_built: string;
}

async function fetchXml(url: string): Promise<{ status: "ok" | "error"; xml: string; error: string | null }> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "chadlewine-health-check" },
      cache: "no-store",
    });
    if (!res.ok) {
      return { status: "error", xml: "", error: `HTTP ${res.status}` };
    }
    return { status: "ok", xml: await res.text(), error: null };
  } catch (err) {
    return { status: "error", xml: "", error: (err as Error).message };
  }
}

export async function GET(req: Request) {
  const origin = publicOrigin(req);
  const now = new Date().toISOString();

  const subs: SubSitemapHealth[] = await Promise.all(
    SUB_SITEMAPS.map(async (s) => {
      const entries = await s.fetch();
      const expected = entries.length;
      const url = `${origin}/${s.filename}`;
      const check = await fetchXml(url);
      const urlCount = check.status === "ok" ? (check.xml.match(/<url>/g)?.length ?? 0) : 0;
      return {
        id: s.id,
        label: s.label,
        filename: s.filename,
        url,
        status: check.status,
        url_count: urlCount,
        expected_count: expected,
        mismatch: urlCount !== expected,
        error: check.error,
        last_built: now,
      };
    }),
  );

  const indexUrl = `${origin}/sitemap.xml`;
  const indexCheck = await fetchXml(indexUrl);
  const indexEntries =
    indexCheck.status === "ok" ? (indexCheck.xml.match(/<sitemap>/g)?.length ?? 0) : 0;

  const totalUrls = subs.reduce((acc, s) => acc + s.url_count, 0);
  const totalExpected = subs.reduce((acc, s) => acc + s.expected_count, 0);
  const anyMismatch = subs.some((s) => s.mismatch);

  return Response.json({
    index: {
      url: indexUrl,
      status: indexCheck.status,
      sub_sitemap_count: indexEntries,
      expected_sub_sitemap_count: SUB_SITEMAPS.length,
      error: indexCheck.error,
      last_built: now,
    },
    sub_sitemaps: subs,
    totals: {
      url_count: totalUrls,
      expected_count: totalExpected,
      any_mismatch: anyMismatch,
    },
  });
}
