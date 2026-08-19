import { createPublicClient } from "@/lib/supabase-server";
import type { SongBriefData } from "@/components/SongBriefCard";

// Builder for the "Read About Chad Lewine Songs" brief cards. Lived in the
// homepage until the section moved to the bottom of /music; it is a lib now so
// the two pages can never drift apart on how a brief is assembled.

// Album slugs whose songs are excluded from the song-brief feed. Singles pages and the
// full /music index still surface these — this is curation, not deletion.
const BROWSE_EXCLUDED_ALBUM_SLUGS = ["demoesque"];

async function getBrowseExcludedSongIds(
  supabase: ReturnType<typeof createPublicClient>,
): Promise<string[]> {
  if (BROWSE_EXCLUDED_ALBUM_SLUGS.length === 0) return [];
  const { data: albums } = await supabase
    .from("releases")
    .select("id")
    .in("slug", BROWSE_EXCLUDED_ALBUM_SLUGS);
  const albumIds = ((albums || []) as { id: string }[]).map((a) => a.id);
  if (albumIds.length === 0) return [];
  const { data: junctions } = await supabase
    .from("release_songs")
    .select("song_id")
    .in("release_id", albumIds);
  return ((junctions || []) as { song_id: string }[]).map((j) => j.song_id);
}

export async function getSongBriefs(): Promise<SongBriefData[]> {
  const supabase = createPublicClient();

  const excludedIds = await getBrowseExcludedSongIds(supabase);

  let query = supabase
    .from("songs")
    .select("id, slug, title, song_summary, chorus, chad_quote, art_image_path, art_alt")
    .in("status", ["unreleased", "published"]);
  if (excludedIds.length > 0) {
    query = query.not("id", "in", `(${excludedIds.join(",")})`);
  }
  const { data: songs } = await query
    .order("release_date", { ascending: false, nullsFirst: false })
    .limit(6);

  if (!songs || songs.length === 0) return [];

  const ids = songs.map((s) => s.id);

  const [{ data: junctions }, { data: sections }] = await Promise.all([
    supabase
      .from("release_songs")
      .select("song_id, release:releases(title, slug, cover_art_path, cover_art_alt)")
      .in("song_id", ids),
    supabase
      .from("song_visibility_sections")
      .select("song_id, category, direct_answer, content, key_points, display_order")
      .in("song_id", ids)
      .eq("status", "published")
      .order("display_order", { ascending: true }),
  ]);

  type ReleaseLite = { title: string; slug: string; cover_art_path: string | null; cover_art_alt: string | null };
  type JunctionRow = { song_id: string; release: ReleaseLite | ReleaseLite[] | null };
  const albumBySong: Record<string, ReleaseLite | null> = {};
  for (const j of (junctions || []) as JunctionRow[]) {
    const alb = Array.isArray(j.release) ? j.release[0] : j.release;
    if (alb && !albumBySong[j.song_id]) albumBySong[j.song_id] = alb;
  }

  const stripMarkdown = (line: string) =>
    line
      .replace(/^[-*+]\s+/, "")
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\*(.+?)\*/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .trim();

  const extractHookLines = (content: string | null | undefined): string[] => {
    if (!content) return [];
    const out: string[] = [];
    for (const raw of content.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      if (/^\*\*[^*]+\*\*$/.test(line)) continue;
      if (/^#{1,6}\s/.test(line)) continue;
      if (/^[-=*_]{3,}$/.test(line)) continue;
      const cleaned = stripMarkdown(line);
      if (cleaned.length < 3) continue;
      out.push(cleaned);
    }
    return out;
  };

  const hooksBySong: Record<string, string[]> = {};
  for (const s of sections || []) {
    if (s.category !== "hooks") continue;
    let pts: string[] = [];
    if (Array.isArray(s.key_points)) {
      pts = s.key_points.map((p: string) => stripMarkdown(p)).filter((p) => p.length >= 3);
    }
    if (pts.length === 0) pts = extractHookLines(s.content);
    if (pts.length > 0) hooksBySong[s.song_id] = pts;
  }

  return songs.map((s) => {
    const alb = albumBySong[s.id];
    return {
      id: s.id,
      slug: s.slug,
      title: s.title,
      song_summary: s.song_summary,
      chorus: s.chorus,
      chad_quote: s.chad_quote,
      // Fall back to the parent release's cover art when the song has no art.
      art_image_path: s.art_image_path || alb?.cover_art_path || null,
      art_alt: s.art_alt || alb?.cover_art_alt || null,
      album: alb ? { title: alb.title, slug: alb.slug } : null,
      hooks: hooksBySong[s.id] || [],
    };
  });
}
