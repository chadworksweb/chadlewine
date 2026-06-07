import type { Metadata } from "next";
import { EntryDetail } from "@/components/EntryDetail";
import { getEntry, getEntrySlugs } from "@/lib/entries";

export const revalidate = 60;

// Prerender + ISR-cache each published observation; new ones render on-demand.
export async function generateStaticParams() {
  const slugs = await getEntrySlugs("observation");
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const obsv = await getEntry("observation", slug);
  if (!obsv) return {};

  const description = obsv.seo_description || obsv.hook_line || "";

  return {
    title: obsv.seo_title || obsv.title,
    description,
    alternates: {
      canonical: `https://chadlewine.com/observations/${slug}`,
    },
    openGraph: {
      type: "article",
      title: obsv.seo_title || obsv.title,
      description,
      images: obsv.art_image_path ? [obsv.art_image_path] : undefined,
      publishedTime: obsv.published_at || obsv.date_captured,
      modifiedTime: obsv.updated_at || undefined,
      authors: ["Chad Lewine"],
      section: obsv.categories?.[0]?.title || "Observations",
    },
  };
}

export default async function ObservationPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <EntryDetail
      kind="observation"
      basePath="/observations"
      slug={slug}
      relatedLabel="Related Observations"
    />
  );
}
