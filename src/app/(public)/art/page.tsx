import type { Metadata } from "next";
import { mergeMetadata } from "@/lib/page-meta";
import { createPublicClient } from "@/lib/supabase-server";
import { SlidingArtPortfolio } from "@/components/SlidingArtPortfolio";
import type { PortfolioItem } from "@/lib/sliding-portfolio";

export const revalidate = 60;

const DEFAULT_METADATA: Metadata = {
  title: "Art",
  description: "Digital and visual art by Chad Lewine.",
  alternates: { canonical: "https://chadlewine.com/art" },
};

export async function generateMetadata(): Promise<Metadata> {
  return mergeMetadata("/art", DEFAULT_METADATA);
}

type ArtRow = {
  id: string;
  slug: string;
  title: string;
  image_path: string;
  medium: string | null;
  dimensions: string | null;
  year_created: number | null;
  gallery_paths: string[] | null;
};

export default async function ArtPage() {
  const supabase = createPublicClient();
  const { data: pieces } = await supabase
    .from("art_pieces")
    .select("id, slug, title, image_path, medium, dimensions, year_created, gallery_paths")
    .in("status", ["unreleased", "published"])
    .order("display_order");

  const items: PortfolioItem[] = ((pieces as ArtRow[] | null) || []).map((p) => {
    const extras = Array.isArray(p.gallery_paths) ? p.gallery_paths.filter(Boolean) : [];
    const meta = {
      line1: p.medium || undefined,
      line2: p.dimensions || undefined,
      line3: p.year_created ? String(p.year_created) : undefined,
    };
    return {
      id: p.id,
      title: p.title,
      slug: p.slug,
      main: p.image_path,
      gallery: [p.image_path, ...extras],
      meta: meta.line1 || meta.line2 || meta.line3 ? meta : undefined,
      sold: false,
    };
  });

  return <SlidingArtPortfolio items={items} />;
}
