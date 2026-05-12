import { createPublicClient } from "@/lib/supabase-server";
import { SongsExplorer } from "@/components/SongsExplorer";

export const revalidate = 60;

export const metadata = {
  title: "Songs",
  description: "Explore every song by theme. Filter by topic, sort by release date or title.",
};

interface Topic {
  id: string;
  label: string;
  slug: string;
}

interface AlbumRef {
  title: string;
  slug: string;
  status: string;
  cover_art_path: string | null;
  cover_art_alt: string | null;
}

export interface SongCardData {
  id: string;
  title: string;
  slug: string;
  status: string;
  is_single: boolean;
  release_date: string | null;
  created_at: string;
  art_image_path: string | null;
  art_alt: string | null;
  card_focal_x: number | null;
  card_focal_y: number | null;
  card_zoom: number | null;
  song_summary: string | null;
  citation_summary: string | null;
  focus_keyphrase: string | null;
  secondary_keyphrases: string[];
  paa_pairs: { question: string; answer: string }[];
  entity_tags: string[];
  album: AlbumRef | null;
  topics: Topic[];
}

async function getSongs(): Promise<{ songs: SongCardData[]; allTopics: Topic[] }> {
  const supabase = createPublicClient();

  const { data: songs } = await supabase
    .from("songs")
    .select("id, title, slug, status, is_single, release_date, created_at, art_image_path, art_alt, card_focal_x, card_focal_y, card_zoom, song_summary, citation_summary, focus_keyphrase, secondary_keyphrases, paa_pairs, entity_tags")
    .in("status", ["unreleased", "published"]);

  if (!songs || songs.length === 0) {
    return { songs: [], allTopics: [] };
  }

  const songIds = songs.map((s) => s.id);

  const [junctionsRes, topicLinksRes, allTopicsRes] = await Promise.all([
    supabase
      .from("album_songs")
      .select("song_id, album:albums(title, slug, status, cover_art_path, cover_art_alt)")
      .in("song_id", songIds),
    supabase
      .from("song_topics")
      .select("song_id, topic:topics(id, label, slug)")
      .in("song_id", songIds),
    supabase.from("topics").select("id, label, slug").order("label"),
  ]);

  const albumBySong: Record<string, AlbumRef | null> = {};
  for (const j of junctionsRes.data || []) {
    const alb = Array.isArray((j as any).album) ? (j as any).album[0] : (j as any).album;
    if (alb && !albumBySong[(j as any).song_id]) {
      albumBySong[(j as any).song_id] = {
        title: alb.title,
        slug: alb.slug,
        status: alb.status,
        cover_art_path: alb.cover_art_path,
        cover_art_alt: alb.cover_art_alt,
      };
    }
  }

  const topicsBySong: Record<string, Topic[]> = {};
  for (const link of topicLinksRes.data || []) {
    const topic = Array.isArray((link as any).topic) ? (link as any).topic[0] : (link as any).topic;
    if (!topic) continue;
    (topicsBySong[(link as any).song_id] ||= []).push({
      id: topic.id,
      label: topic.label,
      slug: topic.slug,
    });
  }

  const cardData: SongCardData[] = songs.map((s) => ({
    id: s.id,
    title: s.title,
    slug: s.slug,
    status: s.status,
    is_single: !!s.is_single,
    release_date: s.release_date,
    created_at: s.created_at,
    art_image_path: s.art_image_path,
    art_alt: s.art_alt,
    card_focal_x: s.card_focal_x ?? null,
    card_focal_y: s.card_focal_y ?? null,
    card_zoom: s.card_zoom ?? null,
    song_summary: s.song_summary,
    citation_summary: s.citation_summary,
    focus_keyphrase: s.focus_keyphrase,
    secondary_keyphrases: Array.isArray(s.secondary_keyphrases) ? s.secondary_keyphrases : [],
    paa_pairs: Array.isArray(s.paa_pairs) ? s.paa_pairs : [],
    entity_tags: Array.isArray(s.entity_tags) ? s.entity_tags : [],
    album: albumBySong[s.id] || null,
    topics: topicsBySong[s.id] || [],
  }));

  return {
    songs: cardData,
    allTopics: (allTopicsRes.data || []) as Topic[],
  };
}

export default async function MusicSongsPage() {
  const { songs, allTopics } = await getSongs();

  return (
    <div className="songs-explorer">
      <div className="songs-explorer__inner site-contain">
        <header className="songs-explorer__header">
          <h1 className="songs-explorer__title">Songs</h1>
          <p className="songs-explorer__lede">
            Every song as a peer. Filter by topic, sort any way — this is the whole body of work, flat.
          </p>
        </header>

        <SongsExplorer songs={songs} allTopics={allTopics} />
      </div>
    </div>
  );
}
