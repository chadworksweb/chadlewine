import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublishedPageWithSections } from "@/lib/pages";
import { PageSections } from "@/components/PageSections";

// Migrated to the Pages CMS: this page now renders from the database
// (pages + page_sections, slug 'music/songs-over-5-minutes'). The rich si-*
// layout lives in <PageSections>; content + SEO are edited in /admin/pages.
// The wrapper id/class are passed here so the page-specific scoped CSS
// (#page-songs-over-five .si-hero__headline) keeps working unchanged.

export const revalidate = 60;

const SLUG = "music/songs-over-5-minutes";
const CANONICAL = "https://chadlewine.com/music/songs-over-5-minutes";

export async function generateMetadata(): Promise<Metadata> {
  const result = await getPublishedPageWithSections(SLUG);
  if (!result) return {};
  const { page } = result;

  // Exact-title rule: a set seo_title is used verbatim (no brand suffix); a
  // blank one lets the bare page title flow through the root "%s - Chad Lewine"
  // template for exactly one suffix.
  const title = page.seo_title ? { absolute: page.seo_title } : page.title;
  const description = page.seo_description || undefined;

  return {
    title,
    description,
    alternates: { canonical: CANONICAL },
    openGraph: {
      title: page.seo_title || `${page.title} - Chad Lewine`,
      description,
      url: CANONICAL,
      type: "website",
      ...(page.og_image_path
        ? { images: [{ url: page.og_image_path, width: 1200, height: 630 }] }
        : {}),
    },
  };
}

export default async function SongsOverFiveMinutesPage() {
  const result = await getPublishedPageWithSections(SLUG);
  if (!result) notFound();
  const { page, sections } = result;

  return (
    <PageSections
      page={page}
      sections={sections}
      wrapperId="page-songs-over-five"
      wrapperClassName="page-songwriting page-super-individual"
    />
  );
}
