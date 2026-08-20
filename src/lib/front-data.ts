// Data for the door: the newest release, the newest video, the newest post.
//
// Three small queries rather than a reuse of the homepage's loaders, because the
// homepage asks different questions. Its feed is CURATED (scoped to one album,
// ordered by track number so unheard tracks lead) and its post list pulls twelve
// for a scrolling column. The door wants the single most recent of each thing,
// by date, with no editorial hand on it.
//
// Every field selected here is rendered as text inside the door's panels. That
// is deliberate and it is the SEO half of this page: the panels are native
// <details>, so their contents ship in the server HTML whether or not anyone
// opens them, and a crawler reads a release summary, a video description and a
// post lede off / exactly as it does today.

import { createPublicClient } from "@/lib/supabase-server";
import { streamIframeUrl, streamThumbnailUrl } from "@/lib/bunny-stream";

export interface FrontRelease {
  title: string;
  slug: string;
  releaseDate: string | null;
  releaseType: string | null;
  coverPath: string | null;
  coverAlt: string | null;
  summary: string | null;
  trackCount: number;
  href: string;
}

export interface FrontVideo {
  title: string;
  slug: string;
  publishedAt: string | null;
  description: string | null;
  thumbnail: string | null;
  embedSrc: string | null;
  durationSeconds: number | null;
  href: string;
}

export interface FrontPost {
  title: string;
  slug: string;
  kind: "observation" | "journal";
  dateCaptured: string | null;
  lede: string | null;
  /* Feeds the page background, not an <img>. */
  artPath: string | null;
  href: string;
}

// Strip a post body down to its opening sentence, for use as a lede.
//
// Lifted from the homepage's own firstSentence rather than imported, because the
// homepage keeps it as a private module function. If a third caller ever wants
// it, that is the moment to promote it to a shared module -- not before.
function firstSentence(html: string | null): string | null {
  if (!html) return null;
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&rsquo;|&lsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+([.!?,;:])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  const match = text.match(/^.*?[.!?](?=\s|$)/);
  return (match ? match[0] : text).trim() || null;
}

export async function getFrontRelease(): Promise<FrontRelease | null> {
  const supabase = createPublicClient();

  // Singles are excluded for the same reason /discography excludes them: since
  // the singles-to-releases migration every single carries a release row too, so
  // including them would let a track that already shipped outrank the album it
  // belongs to. The door says "latest release" and means the record.
  const { data } = await supabase
    .from("releases")
    .select("id, title, slug, release_date, release_type, cover_art_path, cover_art_alt, concept_statement")
    .eq("status", "published")
    .neq("release_type", "single")
    .order("release_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  const { count } = await supabase
    .from("release_songs")
    .select("song_id", { count: "exact", head: true })
    .eq("release_id", data.id);

  return {
    title: data.title,
    slug: data.slug,
    releaseDate: data.release_date ?? null,
    releaseType: data.release_type ?? null,
    coverPath: data.cover_art_path ?? null,
    coverAlt: data.cover_art_alt ?? null,
    summary: data.concept_statement ?? null,
    trackCount: count ?? 0,
    href: `/music/releases/${data.slug}`,
  };
}

export async function getFrontVideo(): Promise<FrontVideo | null> {
  const supabase = createPublicClient();

  // Ordered by date ALONE, with no is_featured tiebreak. /videos leads with the
  // featured video because it is a library and something has to be the cover;
  // this cell is labelled "latest video" and a pinned favourite from two years
  // ago would make that label a lie.
  const { data } = await supabase
    .from("videos")
    .select("title, slug, published_at, description, thumbnail_path, stream_id, embed_url, duration_seconds")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  return {
    title: data.title,
    slug: data.slug,
    publishedAt: data.published_at ?? null,
    description: data.description ?? null,
    thumbnail: data.thumbnail_path || streamThumbnailUrl(data.stream_id),
    // The iframe form on purpose, not the HLS playlist the Pantheon prefers.
    // Native playback there buys a custom transport deck built for a full-screen
    // stage; inside a panel that is at most a few hundred pixels tall, the
    // provider's own controls are the smaller and steadier thing.
    embedSrc: data.embed_url || streamIframeUrl(data.stream_id),
    durationSeconds: data.duration_seconds ?? null,
    href: `/videos/${data.slug}`,
  };
}

export async function getFrontPost(): Promise<FrontPost | null> {
  const supabase = createPublicClient();

  const { data } = await supabase
    .from("posts")
    .select("title, slug, kind, date_captured, hook_line, body, art_image_path")
    .eq("status", "published")
    .in("kind", ["observation", "journal"])
    .order("date_captured", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  const kind = data.kind as "observation" | "journal";
  return {
    title: data.title,
    slug: data.slug,
    kind,
    dateCaptured: data.date_captured ?? null,
    artPath: data.art_image_path ?? null,
    // hook_line is the editorial one-liner and wins when it exists; the opening
    // sentence is the fallback so the panel is never empty.
    lede: (data.hook_line || "").trim() || firstSentence(data.body),
    href: `${kind === "journal" ? "/journal" : "/observations"}/${data.slug}`,
  };
}
