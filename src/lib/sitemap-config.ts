import { createPublicClient } from "@/lib/supabase-server";

export const BASE_URL = "https://chadlewine.com";

export type ChangeFreq =
  | "always"
  | "hourly"
  | "daily"
  | "weekly"
  | "monthly"
  | "yearly"
  | "never";

export interface SitemapImage {
  loc: string;
}

export interface SitemapVideo {
  thumbnailLoc: string;
  title: string;
  description: string;
  contentLoc?: string;
  playerLoc?: string;
  duration?: number;
}

export interface SitemapEntry {
  url: string;
  lastModified?: string;
  changeFrequency?: ChangeFreq;
  priority?: number;
  images?: SitemapImage[];
  videos?: SitemapVideo[];
}

export interface SubSitemap {
  id: string;
  label: string;
  filename: string;
  fetch: () => Promise<SitemapEntry[]>;
}

function isoOrUndef(v: string | null | undefined): string | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  if (isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

function maxIso(values: (string | undefined)[]): string | undefined {
  const valid = values.filter((v): v is string => typeof v === "string");
  if (valid.length === 0) return undefined;
  return valid.reduce((max, cur) => (cur > max ? cur : max));
}

function absoluteUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  if (/^https?:\/\//.test(path)) return path;
  if (path.startsWith("/")) return `${BASE_URL}${path}`;
  return `${BASE_URL}/${path}`;
}

async function fetchPages(): Promise<SitemapEntry[]> {
  const supabase = createPublicClient();
  const now = new Date().toISOString();

  const staticEntries: SitemapEntry[] = [
    { url: BASE_URL, lastModified: now, changeFrequency: "daily", priority: 1 },
    // The full site. / is the front page and carries six internal links, so
    // /home is the hub every deep page is one crawlable click from. It is
    // indexed on purpose: never noindex it, and never redirect it to /.
    { url: `${BASE_URL}/home`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE_URL}/chad-lewine`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${BASE_URL}/radiant-arc`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE_URL}/music`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE_URL}/lyrics`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE_URL}/art`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE_URL}/curation`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE_URL}/discography`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE_URL}/archive/xanga`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE_URL}/merch`, changeFrequency: "weekly", priority: 0.6 },
  ];

  const { data: doorPages } = await supabase
    .from("door_pages")
    .select("slug, updated_at, published_at")
    .eq("status", "published");

  const doorEntries: SitemapEntry[] = (doorPages ?? []).map((dp) => ({
    url: `${BASE_URL}/${dp.slug}`,
    lastModified: isoOrUndef(dp.updated_at) ?? isoOrUndef(dp.published_at),
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  return [...staticEntries, ...doorEntries];
}

async function fetchReleases(): Promise<SitemapEntry[]> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("releases")
    .select("slug, updated_at, cover_art_path")
    .eq("status", "published")
    .neq("release_type", "single")
    .order("display_order");

  return (data ?? []).map((a) => {
    const cover = absoluteUrl(a.cover_art_path);
    return {
      url: `${BASE_URL}/music/releases/${a.slug}`,
      lastModified: isoOrUndef(a.updated_at),
      changeFrequency: "monthly",
      priority: 0.6,
      images: cover ? [{ loc: cover }] : undefined,
    };
  });
}

async function fetchSongs(): Promise<SitemapEntry[]> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("songs")
    .select("slug, updated_at, art_image_path")
    .eq("status", "published")
    .order("title");

  return (data ?? []).map((s) => {
    const art = absoluteUrl(s.art_image_path);
    return {
      url: `${BASE_URL}/music/songs/${s.slug}`,
      lastModified: isoOrUndef(s.updated_at),
      changeFrequency: "monthly",
      priority: 0.5,
      images: art ? [{ loc: art }] : undefined,
    };
  });
}

// observation + journal posts share the `posts` table; each gets its own
// sub-sitemap scoped by `kind` and prefixed with its public section.
async function fetchEntries(kind: "observation" | "journal", section: string): Promise<SitemapEntry[]> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("posts")
    .select("slug, updated_at, published_at, date_captured, art_image_path")
    .eq("status", "published")
    .eq("kind", kind)
    .order("date_captured", { ascending: false });

  return (data ?? []).map((o) => {
    const art = absoluteUrl(o.art_image_path);
    return {
      url: `${BASE_URL}/${section}/${o.slug}`,
      lastModified:
        isoOrUndef(o.updated_at) ??
        isoOrUndef(o.published_at) ??
        isoOrUndef(o.date_captured),
      changeFrequency: "monthly",
      priority: 0.8,
      images: art ? [{ loc: art }] : undefined,
    };
  });
}

function fetchObservations(): Promise<SitemapEntry[]> {
  return fetchEntries("observation", "observations");
}

function fetchJournal(): Promise<SitemapEntry[]> {
  return fetchEntries("journal", "journal");
}

async function fetchArt(): Promise<SitemapEntry[]> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("art_pieces")
    .select("slug, updated_at, image_path, gallery_paths")
    .eq("status", "published");

  return (data ?? []).map((a) => {
    const main = absoluteUrl(a.image_path);
    const galleryRaw: unknown = a.gallery_paths;
    const gallery = Array.isArray(galleryRaw)
      ? (galleryRaw as unknown[])
          .map((g) => (typeof g === "string" ? absoluteUrl(g) : undefined))
          .filter((g): g is string => Boolean(g))
      : [];
    const imageLocs = [main, ...gallery].filter((u): u is string => Boolean(u));
    return {
      url: `${BASE_URL}/art/${a.slug}`,
      lastModified: isoOrUndef(a.updated_at),
      changeFrequency: "monthly",
      priority: 0.5,
      images: imageLocs.length > 0 ? imageLocs.map((loc) => ({ loc })) : undefined,
    };
  });
}

async function fetchCuration(): Promise<SitemapEntry[]> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("curated_entries")
    .select("slug, updated_at, published_at")
    .eq("status", "published");

  return (data ?? []).map((ce) => ({
    url: `${BASE_URL}/curation/${ce.slug}`,
    lastModified: isoOrUndef(ce.updated_at) ?? isoOrUndef(ce.published_at),
    changeFrequency: "monthly",
    priority: 0.7,
  }));
}

async function fetchMerch(): Promise<SitemapEntry[]> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("merch")
    .select("slug, created_at, image_url")
    .eq("status", "active")
    .not("slug", "is", null);

  return (data ?? []).map((p) => {
    const img = absoluteUrl(p.image_url);
    return {
      url: `${BASE_URL}/merch/${p.slug}`,
      lastModified: isoOrUndef(p.created_at),
      changeFrequency: "weekly",
      priority: 0.5,
      images: img ? [{ loc: img }] : undefined,
    };
  });
}

async function fetchVideo(): Promise<SitemapEntry[]> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("videos")
    .select("title, slug, description, thumbnail_path, embed_url, duration_seconds, updated_at, published_at")
    .eq("status", "published")
    .order("published_at", { ascending: false });

  if (!data || data.length === 0) {
    return [
      {
        url: `${BASE_URL}/videos`,
        changeFrequency: "monthly",
        priority: 0.6,
      },
    ];
  }

  const lastMod = maxIso(
    data.flatMap((v) => [isoOrUndef(v.updated_at), isoOrUndef(v.published_at)]),
  );

  // Each video is its own page now, so it gets its own <url> carrying its own
  // <video:video> child, rather than 80 video children hanging off the library
  // index. Google needs a thumbnail and a title per video, so a row missing
  // either is listed as a plain page without the video extension.
  const perVideo: SitemapEntry[] = data.map((v) => {
    const thumb = absoluteUrl(v.thumbnail_path);
    const entry: SitemapEntry = {
      url: `${BASE_URL}/videos/${v.slug}`,
      lastModified: maxIso([isoOrUndef(v.updated_at), isoOrUndef(v.published_at)]),
      changeFrequency: "monthly",
      priority: 0.5,
    };
    if (thumb && v.title) {
      entry.videos = [
        {
          thumbnailLoc: thumb,
          title: v.title,
          description: v.description || v.title,
          playerLoc: absoluteUrl(v.embed_url) || `${BASE_URL}/videos/${v.slug}`,
          duration: v.duration_seconds || undefined,
        },
      ];
    }
    return entry;
  });

  return [
    {
      url: `${BASE_URL}/videos`,
      lastModified: lastMod,
      changeFrequency: "weekly",
      priority: 0.6,
    },
    ...perVideo,
  ];
}

export const SUB_SITEMAPS: SubSitemap[] = [
  { id: "pages", label: "Pages", filename: "sitemap-pages.xml", fetch: fetchPages },
  { id: "releases", label: "Releases", filename: "sitemap-releases.xml", fetch: fetchReleases },
  { id: "songs", label: "Songs", filename: "sitemap-songs.xml", fetch: fetchSongs },
  { id: "observations", label: "Observations", filename: "sitemap-observations.xml", fetch: fetchObservations },
  { id: "journal", label: "Journal", filename: "sitemap-journal.xml", fetch: fetchJournal },
  { id: "art", label: "Art", filename: "sitemap-art.xml", fetch: fetchArt },
  { id: "curation", label: "Curation", filename: "sitemap-curation.xml", fetch: fetchCuration },
  { id: "merch", label: "Merch", filename: "sitemap-merch.xml", fetch: fetchMerch },
  { id: "video", label: "Video", filename: "sitemap-video.xml", fetch: fetchVideo },
];

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toHttpDate(iso: string): string {
  return new Date(iso).toUTCString();
}

export function computeMaxLastmod(entries: SitemapEntry[]): string | undefined {
  return maxIso(entries.map((e) => e.lastModified));
}

export function makeSitemapRoute(id: string) {
  return async function GET(): Promise<Response> {
    const sub = SUB_SITEMAPS.find((s) => s.id === id);
    if (!sub) {
      return new Response("Not found", { status: 404 });
    }
    const entries = await sub.fetch();
    const lastmod = computeMaxLastmod(entries) ?? new Date().toISOString();
    return new Response(renderUrlset(entries), {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600",
        "Last-Modified": toHttpDate(lastmod),
      },
    });
  };
}

export function renderUrlset(entries: SitemapEntry[]): string {
  const hasImages = entries.some((e) => e.images && e.images.length > 0);
  const hasVideos = entries.some((e) => e.videos && e.videos.length > 0);

  let nsAttrs = `xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"`;
  if (hasImages) nsAttrs += ` xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"`;
  if (hasVideos) nsAttrs += ` xmlns:video="http://www.google.com/schemas/sitemap-video/1.1"`;

  const urls = entries
    .map((e) => {
      const parts: string[] = [`    <loc>${escapeXml(e.url)}</loc>`];
      if (e.lastModified) parts.push(`    <lastmod>${e.lastModified}</lastmod>`);
      if (e.changeFrequency) parts.push(`    <changefreq>${e.changeFrequency}</changefreq>`);
      if (typeof e.priority === "number") parts.push(`    <priority>${e.priority}</priority>`);

      if (e.images) {
        for (const img of e.images) {
          parts.push(
            `    <image:image>\n      <image:loc>${escapeXml(img.loc)}</image:loc>\n    </image:image>`,
          );
        }
      }

      if (e.videos) {
        for (const v of e.videos) {
          const vparts = [
            `      <video:thumbnail_loc>${escapeXml(v.thumbnailLoc)}</video:thumbnail_loc>`,
            `      <video:title>${escapeXml(v.title)}</video:title>`,
            `      <video:description>${escapeXml(v.description)}</video:description>`,
          ];
          if (v.contentLoc) vparts.push(`      <video:content_loc>${escapeXml(v.contentLoc)}</video:content_loc>`);
          if (v.playerLoc) vparts.push(`      <video:player_loc>${escapeXml(v.playerLoc)}</video:player_loc>`);
          if (typeof v.duration === "number") vparts.push(`      <video:duration>${v.duration}</video:duration>`);
          parts.push(`    <video:video>\n${vparts.join("\n")}\n    </video:video>`);
        }
      }

      return `  <url>\n${parts.join("\n")}\n  </url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>
<urlset ${nsAttrs}>
${urls}
</urlset>`;
}

export function renderSitemapIndex(subs: Array<{ filename: string; lastmod: string }>): string {
  const items = subs
    .map(
      (s) => `  <sitemap>
    <loc>${BASE_URL}/${s.filename}</loc>
    <lastmod>${s.lastmod}</lastmod>
  </sitemap>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${items}
</sitemapindex>`;
}

export function httpDate(iso: string): string {
  return toHttpDate(iso);
}
