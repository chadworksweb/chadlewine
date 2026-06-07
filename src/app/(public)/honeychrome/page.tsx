import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublishedPageWithSections } from "@/lib/pages";
import { PageSections } from "@/components/PageSections";

// Migrated to the Pages CMS: renders from the database (pages + page_sections,
// slug 'honeychrome'). Content + SEO are edited in /admin/pages.

export const revalidate = 60;

const SLUG = "honeychrome";
const CANONICAL = "https://chadlewine.com/honeychrome";

export async function generateMetadata(): Promise<Metadata> {
  const result = await getPublishedPageWithSections(SLUG);
  if (!result) return {};
  const { page } = result;

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
      type: "article",
      ...(page.og_image_path
        ? { images: [{ url: page.og_image_path, width: 1200, height: 630 }] }
        : {}),
    },
  };
}

export default async function HoneyChromePage() {
  const result = await getPublishedPageWithSections(SLUG);
  if (!result) notFound();
  const { page, sections } = result;

  return (
    <PageSections
      page={page}
      sections={sections}
      wrapperId="page-honeychrome"
      wrapperClassName="page-super-individual"
    />
  );
}
