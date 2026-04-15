import type { Metadata } from "next";
import { mergeMetadata } from "@/lib/page-meta";
import { createPublicClient } from "@/lib/supabase-server";
import { ArtGallery } from "@/components/ArtGallery";

export const revalidate = 60;

const DEFAULT_METADATA: Metadata = {
  title: "Art — Chad Lewine",
  description: "Digital and visual art by Chad Lewine.",
  alternates: { canonical: "https://chadlewine.com/art" },
};

export async function generateMetadata(): Promise<Metadata> {
  return mergeMetadata("/art", DEFAULT_METADATA);
}

export default async function ArtPage() {
  const supabase = createPublicClient();
  const { data: pieces } = await supabase
    .from("art_pieces")
    .select("id, title, slug, medium, image_path, image_alt, description")
    .eq("status", "published")
    .order("display_order");

  return (
    <div id="page-art" className="page-static">
      <h1 className="page-static__title">Art</h1>
      <ArtGallery pieces={pieces || []} />
    </div>
  );
}
