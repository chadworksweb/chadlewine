import { createAdminClient } from "@/lib/supabase-server";

export async function GET() {
  const supabase = createAdminClient();
  const siteUrl = "https://chadlewine.com";

  // Count published content
  const [
    { count: obsCount },
    { count: medCount },
    { count: foundCount },
    { count: doorCount },
    { count: albumCount },
    { count: songCount },
    { count: curationCount },
  ] = await Promise.all([
    supabase.from("observations").select("*", { count: "exact", head: true }).eq("status", "published"),
    supabase.from("meditations").select("*", { count: "exact", head: true }).eq("status", "published"),
    supabase.from("foundations").select("*", { count: "exact", head: true }),
    supabase.from("door_pages").select("*", { count: "exact", head: true }).eq("status", "published"),
    supabase.from("albums").select("*", { count: "exact", head: true }).eq("status", "published"),
    supabase.from("songs").select("*", { count: "exact", head: true }).eq("status", "published"),
    supabase.from("curated_entries").select("*", { count: "exact", head: true }).eq("status", "published"),
  ]);

  // Static pages count (from sitemap: home, chad-lewine, foundations, meditations, music, lyrics, video, art, curation, archive/xanga, discography, merch, merch/configure, merch/art, merch/line, merch/fusion, merch/pick)
  const staticPages = 17;

  const expectedTotal =
    staticPages +
    (obsCount || 0) +
    (medCount || 0) +
    (foundCount || 0) +
    (doorCount || 0) +
    (albumCount || 0) +
    (songCount || 0) +
    (curationCount || 0);

  // Fetch actual sitemap
  let sitemapStatus: "ok" | "error" | "missing" = "missing";
  let sitemapUrlCount = 0;
  let sitemapError = "";

  try {
    const res = await fetch(`${siteUrl}/sitemap.xml`, {
      headers: { "User-Agent": "chadlewine-health-check" },
    });
    if (res.ok) {
      const xml = await res.text();
      // Count <url> entries
      const matches = xml.match(/<url>/g);
      sitemapUrlCount = matches ? matches.length : 0;
      sitemapStatus = "ok";
    } else {
      sitemapStatus = "error";
      sitemapError = `HTTP ${res.status}`;
    }
  } catch (err) {
    sitemapStatus = "error";
    sitemapError = (err as Error).message;
  }

  const mismatch = sitemapUrlCount !== expectedTotal;

  return Response.json({
    sitemap_status: sitemapStatus,
    sitemap_url_count: sitemapUrlCount,
    expected_url_count: expectedTotal,
    mismatch,
    sitemap_error: sitemapError || null,
    breakdown: {
      static_pages: staticPages,
      observations: obsCount || 0,
      meditations: medCount || 0,
      foundations: foundCount || 0,
      door_pages: doorCount || 0,
      albums: albumCount || 0,
      songs: songCount || 0,
      curation_entries: curationCount || 0,
    },
  });
}
