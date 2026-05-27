import type { Metadata } from "next";
import { mergeMetadata } from "@/lib/page-meta";
import { createPublicClient } from "@/lib/supabase-server";
import { PillarColonnade } from "@/components/PillarColonnade";

export const revalidate = 60;

const DEFAULT_METADATA: Metadata = {
  title: "Pillar Songs",
  description:
    "The songs of mine I resonate with most strongly -- the pillars. A hand-ordered shrine to the work that holds up everything else.",
  alternates: { canonical: "https://chadlewine.com/pillar-songs" },
  openGraph: {
    title: "Pillar Songs - Chad Lewine",
    description: "The songs of mine I resonate with most strongly.",
    url: "https://chadlewine.com/pillar-songs",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  return mergeMetadata("/pillar-songs", DEFAULT_METADATA);
}

interface SongRow {
  id: string;
  title: string;
  slug: string;
  status: string;
  art_image_path: string | null;
  art_alt: string | null;
  chad_quote: string | null;
  song_summary: string | null;
}

interface PillarEntry extends SongRow {
  note: string | null;
}

async function getPillarSongs(): Promise<PillarEntry[]> {
  const supabase = createPublicClient();

  const { data: rows } = await supabase
    .from("pillar_songs")
    .select("song_id, position, note")
    .order("position", { ascending: true });

  const ids = (rows || []).map((r) => r.song_id);
  if (ids.length === 0) return [];

  const { data: songs } = await supabase
    .from("songs")
    .select("id, title, slug, status, art_image_path, art_alt, chad_quote, song_summary")
    .in("id", ids)
    .eq("status", "published");

  const byId = new Map((songs || []).map((s) => [s.id, s as SongRow]));
  return (rows || [])
    .map((r) => {
      const song = byId.get(r.song_id);
      if (!song) return null;
      return { ...song, note: r.note as string | null };
    })
    .filter((x): x is PillarEntry => x !== null);
}

export default async function PillarSongsPage() {
  const songs = await getPillarSongs();

  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Pillar Songs - Chad Lewine",
    description: "The songs of mine I resonate with most strongly.",
    url: "https://chadlewine.com/pillar-songs",
    itemListOrder: "https://schema.org/ItemListOrderAscending",
    numberOfItems: songs.length,
    itemListElement: songs.map((s, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `https://chadlewine.com/music/songs/${s.slug}`,
      name: s.title,
    })),
  };

  return (
    <div id="page-pillar-songs" className="page-pillar-songs">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />

      <header className="pillar-hero" aria-labelledby="pillar-hero-heading">
        <div className="pillar-hero__inner">
          <p className="pillar-hero__eyebrow">The ones that hold me up</p>
          <h1 id="pillar-hero-heading" className="pillar-hero__title">Pillar Songs</h1>
          <p className="pillar-hero__sub">
            Of everything I&rsquo;ve made, these are the songs I resonate with most strongly.
            Not the singles, not the hits &mdash; the pillars. The ones the rest leans on.
          </p>
        </div>
      </header>

      {songs.length === 0 ? (
        <p className="pillar-empty">The shrine is being arranged. Come back soon.</p>
      ) : (
        <PillarColonnade
          songs={songs.map((s) => ({
            id: s.id,
            slug: s.slug,
            title: s.title,
            line: s.note || s.chad_quote || s.song_summary,
            art: s.art_image_path,
            alt: s.art_alt,
          }))}
        />
      )}
    </div>
  );
}
