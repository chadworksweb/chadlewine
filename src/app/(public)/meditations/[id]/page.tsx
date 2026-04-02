import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { createPublicClient } from "@/lib/supabase-server";
import { formatDate } from "@/lib/utils";
import { AdminEditButton } from "@/components/AdminEditButton";
import { SocialShare } from "@/components/SocialShare";
import { SynapseDisplay } from "@/components/SynapseDisplay";
import { MeditationMerchSection } from "@/components/MeditationMerchSection";

export const revalidate = 60;

interface MeditationWithMeta {
  id: string;
  body: string;
  plain_text: string;
  status: string;
  published_at: string;
  created_at: string;
  updated_at: string;
  categories: { title: string; slug: string }[];
  tags: { label: string; slug: string }[];
}

async function getMeditation(id: string): Promise<MeditationWithMeta | null> {
  const supabase = createPublicClient();

  const { data: meditation } = await supabase
    .from("meditations")
    .select("*")
    .eq("id", id)
    .eq("status", "published")
    .single();

  if (!meditation) return null;

  const { data: categoryLinks } = await supabase
    .from("meditation_categories")
    .select("category_id, categories(title, slug)")
    .eq("meditation_id", meditation.id);

  const { data: tagLinks } = await supabase
    .from("meditation_tags")
    .select("tag_id, tags(label, slug)")
    .eq("meditation_id", meditation.id);

  return {
    ...meditation,
    categories: categoryLinks?.map((c) => (c as Record<string, unknown>).categories as { title: string; slug: string }) || [],
    tags: tagLinks?.map((t) => (t as Record<string, unknown>).tags as { label: string; slug: string }) || [],
  };
}

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const { id } = await params;
  const meditation = await getMeditation(id);

  if (!meditation) {
    return { title: "Not Found — Chad Lewine" };
  }

  const description = meditation.plain_text.length > 160
    ? meditation.plain_text.slice(0, 157) + "..."
    : meditation.plain_text;

  return {
    title: `Meditation — Chad Lewine`,
    description,
    alternates: { canonical: `https://chadlewine.com/meditations/${id}` },
    openGraph: {
      title: `Meditation — Chad Lewine`,
      description,
      url: `https://chadlewine.com/meditations/${id}`,
      type: "article",
      publishedTime: meditation.published_at,
    },
    robots: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  };
}

export default async function MeditationPermalinkPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const meditation = await getMeditation(id);

  if (!meditation) notFound();

  return (
    <div className="page-meditation-single" data-meditation-id={id}>
      <AdminEditButton href={`/admin/meditations/${id}`} />
      <article className="meditation-single">
        <div
          className="meditation-single__body"
          dangerouslySetInnerHTML={{ __html: meditation.body }}
        />
        <footer className="meditation-single__footer">
          <time className="meditation-single__date">
            {formatDate(meditation.published_at || meditation.created_at)}
          </time>
          {meditation.categories.length > 0 && (
            <div className="meditation-single__meta">
              {meditation.categories.map((c) => (
                <span key={c.slug} className="meditation-card__category">{c.title}</span>
              ))}
            </div>
          )}
          {meditation.tags.length > 0 && (
            <div className="meditation-single__meta">
              {meditation.tags.map((t) => (
                <span key={t.slug} className="meditation-card__tag">#{t.label}</span>
              ))}
            </div>
          )}
        </footer>
      </article>

      <MeditationMerchSection meditationId={id} meditationText={meditation.plain_text} />

      <SynapseDisplay sourceType="meditation" sourceId={id} />

      <SocialShare
        url={`https://chadlewine.com/meditations/${id}`}
        text={meditation.plain_text.length > 200 ? meditation.plain_text.slice(0, 197) + "..." : meditation.plain_text}
      />

      <nav className="meditation-single__nav">
        <Link href="/meditations" className="meditation-single__back">
          All Meditations
        </Link>
      </nav>
    </div>
  );
}
