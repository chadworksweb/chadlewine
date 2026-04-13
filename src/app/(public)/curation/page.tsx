import type { Metadata } from "next";
import Link from "next/link";
import { createPublicClient } from "@/lib/supabase-server";
import { CurationGrid } from "@/components/CurationGrid";


export const revalidate = 60;

export const metadata: Metadata = {
  title: "Curation — Chad Lewine",
  description: "The world's largest collection of positively charged music, quantified by Rising Compass.",
  alternates: { canonical: "https://chadlewine.com/curation" },
};

export default async function CurationPage() {
  const supabase = createPublicClient();

  const { data: entries } = await supabase
    .from("curated_entries")
    .select("id, type, title, slug, artist_name, description, cover_image_path, rising_compass_score, rising_compass_classification, genre, mood_tags")
    .eq("status", "published")
    .order("display_order");

  return (
    <div id="page-curation" className="page-static">
      <h1 className="page-static__title">Curation</h1>
      <p className="curation-intro">Positively charged music, quantified by Rising Compass. Not opinion — receipts.</p>
      <Link href="/curation/cl-stream" className="cl-stream-curation-link">CL Stream →</Link>
      <CurationGrid entries={entries || []} />
    </div>
  );
}
