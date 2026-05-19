import type { Metadata } from "next";
import Image from "next/image";
import { mergeMetadata } from "@/lib/page-meta";
import { createPublicClient } from "@/lib/supabase-server";
import { MeditationArchive } from "@/components/MeditationArchive";

export const revalidate = 60;

const DEFAULT_METADATA: Metadata = {
  title: "Meditations",
  description: "Short form real time verbatim channelings",
  alternates: { canonical: "https://chadlewine.com/meditations" },
  openGraph: {
    title: "Meditations — Chad Lewine",
    description: "Short form real time verbatim channelings",
    url: "https://chadlewine.com/meditations",
    type: "website",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  return mergeMetadata("/meditations", DEFAULT_METADATA);
}

async function getMeditations() {
  const supabase = createPublicClient();

  const { data: meditations } = await supabase
    .from("meditations")
    .select("id, body, plain_text, published_at, created_at")
    .eq("status", "published")
    .order("published_at", { ascending: false });

  if (!meditations || meditations.length === 0) return [];

  const ids = meditations.map((m) => m.id);

  const { data: categoryLinks } = await supabase
    .from("meditation_categories")
    .select("meditation_id, category_id, categories(title, slug)")
    .in("meditation_id", ids);

  const medCatMap = new Map<string, { title: string; slug: string }[]>();
  categoryLinks?.forEach((link) => {
    const existing = medCatMap.get(link.meditation_id) || [];
    const cat = (link as Record<string, unknown>).categories as { title: string; slug: string };
    if (cat) existing.push(cat);
    medCatMap.set(link.meditation_id, existing);
  });

  const { data: tagLinks } = await supabase
    .from("meditation_tags")
    .select("meditation_id, tag_id, tags(label, slug)")
    .in("meditation_id", ids);

  const medTagMap = new Map<string, { label: string; slug: string }[]>();
  tagLinks?.forEach((link) => {
    const existing = medTagMap.get(link.meditation_id) || [];
    const tag = (link as Record<string, unknown>).tags as { label: string; slug: string };
    if (tag) existing.push(tag);
    medTagMap.set(link.meditation_id, existing);
  });

  return meditations.map((m) => ({
    ...m,
    categories: medCatMap.get(m.id) || [],
    tags: medTagMap.get(m.id) || [],
  }));
}

async function getHeroImage() {
  const supabase = createPublicClient();
  const { data } = await supabase.storage
    .from("observation-images")
    .getPublicUrl("page-heroes/meditations.webp");
  return data?.publicUrl || "";
}

export default async function MeditationsPage() {
  const [meditations, heroImage] = await Promise.all([
    getMeditations(),
    getHeroImage(),
  ]);

  return (
    <div className="page-meditations">
      {/* Cover Hero — static art, swappable via Supabase Storage */}
      <section className="cover-hero">
        {heroImage && (
          <div className="cover-hero__art-wrap">
            <Image
              src={heroImage}
              alt="Meditations"
              width={2400}
              height={1200}
              priority
              sizes="100vw"
              className="cover-hero__art"
            />
          </div>
        )}

        <div className="cover-hero__content">
          <div className="cover-hero__title-col">
            <h1 className="cover-hero__title">
              Meditations
            </h1>
          </div>

          <div className="cover-hero__bar">
            <span className="cover-hero__date">
              {meditations.length} meditation{meditations.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      </section>

      {/* Feed + sidebar with interactive filtering */}
      {meditations.length > 0 && (
        <section className="meditation-archive">
          <MeditationArchive meditations={meditations} />
        </section>
      )}

      {meditations.length === 0 && (
        <section className="empty-state">
          <p className="empty-state__message">No meditations published yet.</p>
        </section>
      )}
    </div>
  );
}
