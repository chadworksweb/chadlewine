import { createAdminClient } from "@/lib/supabase-server";

export async function GET() {
  const supabase = createAdminClient();

  const { data: observations } = await supabase
    .from("observations")
    .select(
      "id, title, slug, status, geo_readiness_score, focus_keyphrase, citation_summary, first_sentence_extractable, word_count, paa_pairs, entity_tags, art_image_path, art_alt, published_at, date_captured"
    )
    .order("date_captured", { ascending: false });

  return Response.json({ observations: observations || [] });
}
