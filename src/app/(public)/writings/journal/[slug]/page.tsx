import type { Metadata } from "next";
import { EntryDetail } from "@/components/EntryDetail";
import { getEntry, getEntrySlugs } from "@/lib/entries";

export const revalidate = 60;

// Prerender + ISR-cache each published journal entry; new ones render on-demand.
export async function generateStaticParams() {
  const slugs = await getEntrySlugs("journal");
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const entry = await getEntry("journal", slug);
  if (!entry) return {};

  const description = entry.seo_description || entry.hook_line || "";

  return {
    title: entry.seo_title || entry.title,
    description,
    alternates: {
      canonical: `https://chadlewine.com/writings/journal/${slug}`,
    },
    openGraph: {
      type: "article",
      title: entry.seo_title || entry.title,
      description,
      images: entry.art_image_path ? [entry.art_image_path] : undefined,
      publishedTime: entry.published_at || entry.date_captured,
      modifiedTime: entry.updated_at || undefined,
      authors: ["Chad Lewine"],
      section: entry.categories?.[0]?.title || "Journal",
    },
  };
}

export default async function JournalPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <EntryDetail
      kind="journal"
      basePath="/writings/journal"
      slug={slug}
      relatedLabel="Related Entries"
    />
  );
}
